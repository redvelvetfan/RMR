const UGA_SCHOOL_ID = "U2Nob29sLTExMDE="; // btoa("School-1101") — University of Georgia

const RMP_GQL = "https://www.ratemyprofessors.com/graphql";

const QUERY = `
query TeacherSearchQuery($text: String!, $schoolID: ID!) {
  newSearch {
    teachers(query: {text: $text, schoolID: $schoolID}, first: 5) {
      edges {
        node {
          id
          firstName
          lastName
          avgRating
          avgDifficulty
          numRatings
          wouldTakeAgainPercent
        }
      }
    }
  }
}`;

// Session cache and in-flight deduplication
const cache = new Map();
const pending = new Map();

function norm(str) {
    return str.toLowerCase().replace(/[^a-z]/g, "");
}

function firstNameMatch(a, b) {
    const na = norm(a);
    const nb = norm(b);
    if (!na || !nb) return false;
    // Allow prefix match so Brad ↔ Bradley, Chris ↔ Christopher, etc.
    return na === nb || na.startsWith(nb) || nb.startsWith(na);
}

function isGoodMatch(queryName, firstName, lastName) {
    // Drop middle initials (single letters)
    const tokens = queryName.split(/\s+/).filter(t => norm(t).length > 1);
    if (tokens.length < 2) return false;
    const qFirst = tokens[0];
    const qLast  = tokens[tokens.length - 1];
    // Last name must be an exact match; first name allows nickname prefixes
    return norm(qLast) === norm(lastName) && firstNameMatch(qFirst, firstName);
}

function rmpUrl(encodedId) {
    // RMP IDs are base64("Teacher-12345") — extract the numeric part
    const numeric = atob(encodedId).split("-").pop();
    return `https://www.ratemyprofessors.com/professor/${numeric}`;
}

async function fetchProf(name) {
    // Strip initials before sending to RMP for a cleaner search
    const searchText = name.split(/\s+/).filter(t => norm(t).length > 1).join(" ");

    try {
        const res = await fetch(RMP_GQL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Basic dGVzdDp0ZXN0",
            },
            body: JSON.stringify({
                query: QUERY,
                variables: { text: searchText, schoolID: UGA_SCHOOL_ID },
            }),
        });

        const json = await res.json();
        const edges = json?.data?.newSearch?.teachers?.edges ?? [];

        for (const { node } of edges) {
            if (isGoodMatch(name, node.firstName, node.lastName)) {
                return {
                    avgRating: node.avgRating,
                    avgDifficulty: node.avgDifficulty,
                    numRatings: node.numRatings,
                    wouldTakeAgainPercent: node.wouldTakeAgainPercent,
                    url: rmpUrl(node.id),
                };
            }
        }
        return null;
    } catch (_) {
        return null;
    }
}

async function lookupProf(name) {
    if (cache.has(name)) return cache.get(name);
    // Deduplicate concurrent requests for the same name
    if (pending.has(name)) return pending.get(name);

    const promise = fetchProf(name).then(result => {
        cache.set(name, result);
        pending.delete(name);
        return result;
    });
    pending.set(name, promise);
    return promise;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "LOOKUP_PROF") {
        lookupProf(msg.name).then(sendResponse);
        return true;
    }
});
