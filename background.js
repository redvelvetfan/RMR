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

function normTokens(str) {
    return str
        .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip diacritics
        .toLowerCase()
        .replace(/[^a-z]+/g, " ")                         // hyphens/punctuation → spaces
        .trim().split(/\s+/)
        .filter(t => t.length > 1);                        // drop single-letter initials
}

function tokenMatch(a, b) {
    // Exact match OR one is a prefix of the other (Brad ↔ Bradley, etc.)
    return a === b || a.startsWith(b) || b.startsWith(a);
}

function isGoodMatch(queryName, firstName, lastName) {
    const aTokens = normTokens(queryName);
    const rTokens = normTokens(`${firstName} ${lastName}`);
    if (aTokens.length < 1 || rTokens.length < 1) return false;

    // Fraction of RMP tokens that match any Athena token
    const matches = rTokens.filter(rt => aTokens.some(at => tokenMatch(rt, at)));
    const score = matches.length / rTokens.length;

    // Athena's last token must appear somewhere in the RMP name
    // (guards against purely first-name-based false positives)
    const aLast = aTokens[aTokens.length - 1];
    const lastNamePresent = rTokens.some(rt => tokenMatch(rt, aLast));

    return score >= 0.6 && lastNamePresent;
}

function rmpUrl(encodedId) {
    // RMP IDs are base64("Teacher-12345") — extract the numeric part
    const numeric = atob(encodedId).split("-").pop();
    return `https://www.ratemyprofessors.com/professor/${numeric}`;
}

async function queryRMP(searchText, name) {
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

async function fetchProf(name) {
    const tokens = normTokens(name);
    if (tokens.length < 2) return null;

    // Pass 1: search by full name minus initials ("Bradley Barnes")
    const result = await queryRMP(tokens.join(" "), name);
    if (result) return result;

    // Pass 2: search by last name only so RMP returns all professors with that
    // surname at UGA — catches nicknames like Brad ↔ Bradley that pass 1 misses
    return queryRMP(tokens[tokens.length - 1], name);
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
