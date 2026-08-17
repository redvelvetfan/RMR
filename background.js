const UGA_SCHOOL_ID = "U2Nob29sLTExMDE="; // btoa("School-1101") — University of Georgia

const RMP_GQL = "https://www.ratemyprofessors.com/graphql";

const QUERY = `
query TeacherSearchQuery($text: String!, $schoolID: ID!) {
  newSearch {
    teachers(query: {text: $text, schoolID: $schoolID}, first: 5) {
      edges {
        node {
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

// Session cache — persists until service worker is evicted
const cache = new Map();

function nameTokens(str) {
    // Drop middle initials like "G." or "G" (single letter, optionally with period)
    return str.toLowerCase().split(/\s+/).filter(t => t.replace(".", "").length > 1);
}

function nameSimilarity(query, first, last) {
    const qTokens = nameTokens(query);
    const rTokens = nameTokens(`${first} ${last}`);
    const shared = qTokens.filter(t => rTokens.includes(t)).length;
    return shared / Math.max(qTokens.length, rTokens.length);
}

function stripInitials(name) {
    return name.split(/\s+/).filter(t => t.replace(".", "").length > 1).join(" ");
}

async function lookupProf(name) {
    if (cache.has(name)) return cache.get(name);

    const searchName = stripInitials(name);
    let result = null;
    try {
        const res = await fetch(RMP_GQL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Basic dGVzdDp0ZXN0",
            },
            body: JSON.stringify({
                query: QUERY,
                variables: { text: searchName, schoolID: UGA_SCHOOL_ID },
            }),
        });

        const json = await res.json();
        const edges = json?.data?.newSearch?.teachers?.edges ?? [];

        // Pick the best-matching result — require at least one shared name token
        for (const { node } of edges) {
            if (nameSimilarity(name, node.firstName, node.lastName) >= 0.4) {
                result = {
                    avgRating: node.avgRating,
                    avgDifficulty: node.avgDifficulty,
                    numRatings: node.numRatings,
                    wouldTakeAgainPercent: node.wouldTakeAgainPercent,
                };
                break;
            }
        }
    } catch (_) {
        // Network error — don't cache so a retry can succeed
        return null;
    }

    cache.set(name, result);
    return result;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "LOOKUP_PROF") {
        lookupProf(msg.name).then(sendResponse);
        return true; // keep message channel open for async response
    }
});
