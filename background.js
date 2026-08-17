// RMP school ID for University of Georgia.
// Verify: visit https://www.ratemyprofessors.com/school/1139 — if it's UGA, this is correct.
// To find the right ID: open RMP, search for your school, inspect the URL.
// Then encode: btoa("School-<numericId>")
const UGA_SCHOOL_ID = "U2Nob29sLTExMzk="; // School-1139

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

function nameSimilarity(query, first, last) {
    const qTokens = query.toLowerCase().split(/\s+/);
    const rTokens = `${first} ${last}`.toLowerCase().split(/\s+/);
    const shared = qTokens.filter(t => rTokens.includes(t)).length;
    return shared / Math.max(qTokens.length, rTokens.length);
}

async function lookupProf(name) {
    if (cache.has(name)) return cache.get(name);

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
                variables: { text: name, schoolID: UGA_SCHOOL_ID },
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
