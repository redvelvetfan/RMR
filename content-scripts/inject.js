const STYLE = `
    .rmr-badge {
        display: inline-block;
        margin-left: 6px;
        padding: 1px 6px;
        border-radius: 3px;
        font-size: 11px;
        font-weight: bold;
        vertical-align: middle;
        cursor: default;
        font-family: sans-serif;
    }
    .rmr-loading { background: #ddd; color: #888; }
    .rmr-rated   { background: #1a73e8; color: #fff; }
    .rmr-none    { background: #eee; color: #aaa; }
`;

(function injectStyles() {
    const el = document.createElement("style");
    el.textContent = STYLE;
    document.head.appendChild(el);
})();

function updateBadge(badge, data) {
    badge.classList.remove("rmr-loading");
    if (!data || data.avgRating == null) {
        badge.className = "rmr-badge rmr-none";
        badge.textContent = "N/A";
        return;
    }
    badge.className = "rmr-badge rmr-rated";
    badge.textContent = `⭐ ${data.avgRating.toFixed(1)}`;
    const again = data.wouldTakeAgainPercent != null
        ? `${Math.round(data.wouldTakeAgainPercent)}%` : "?";
    const diff = data.avgDifficulty != null
        ? data.avgDifficulty.toFixed(1) : "?";
    badge.title = `${data.numRatings} rating${data.numRatings !== 1 ? "s" : ""} · Difficulty: ${diff} · Would take again: ${again}`;
}

function processRow(tr) {
    if (tr.dataset.rmrDone) return;
    const link = tr.querySelector("a.email");
    if (!link) return;

    const name = link.textContent.trim();
    if (!name) return;

    tr.dataset.rmrDone = "1";

    const badge = document.createElement("span");
    badge.className = "rmr-badge rmr-loading";
    badge.textContent = "…";
    link.insertAdjacentElement("afterend", badge);

    chrome.runtime.sendMessage({ type: "LOOKUP_PROF", name }, (resp) => {
        if (chrome.runtime.lastError) return;
        updateBadge(badge, resp);
    });
}

function scanNode(root) {
    if (root.matches?.("tr") && root.closest("table#table1")) {
        processRow(root);
        return;
    }
    root.querySelectorAll?.("table#table1 tbody tr").forEach(processRow);
}

// Initial pass
document.querySelectorAll("table#table1 tbody tr").forEach(processRow);

// Watch for AJAX-loaded rows and table re-renders
new MutationObserver((mutations) => {
    for (const m of mutations) {
        for (const node of m.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) scanNode(node);
        }
    }
}).observe(document.body, { childList: true, subtree: true });
