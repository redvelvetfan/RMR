// DOM Inspector — run on Athena, report console output so we can build the real selectors
console.log("[RMR] content script loaded on", window.location.href);

const NAME_LIKE = /^[A-Z][a-z]+([ \-][A-Z][a-z]+)+$/;

function getSelector(el) {
    if (el.id) return `#${el.id}`;
    const parts = [];
    while (el && el.nodeType === Node.ELEMENT_NODE) {
        let seg = el.tagName.toLowerCase();
        if (el.id) { seg += `#${el.id}`; parts.unshift(seg); break; }
        if (el.className) seg += "." + [...el.classList].join(".");
        parts.unshift(seg);
        el = el.parentElement;
    }
    return parts.join(" > ");
}

function inspectNode(root) {
    // Look for elements whose class/id hints at instructor data
    const hintRe = /instructor|faculty|professor|teacher|staff/i;
    root.querySelectorAll("*").forEach(el => {
        if (hintRe.test(el.className) || hintRe.test(el.id)) {
            console.log("[RMR] hint-element:", getSelector(el), "| text:", el.textContent.trim().slice(0, 120));
        }
    });

    // Walk every text node looking for name-shaped strings
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
        const text = node.textContent.trim();
        if (NAME_LIKE.test(text)) {
            console.log("[RMR] name-candidate:", JSON.stringify(text), "| parent:", getSelector(node.parentElement));
        }
    }
}

// Run on current DOM
inspectNode(document.body);

// Watch for dynamically loaded content (SPA navigation, Ajax table updates)
const observer = new MutationObserver(mutations => {
    for (const m of mutations) {
        for (const node of m.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                console.log("[RMR] DOM mutation — new node:", getSelector(node), "| text:", node.textContent.trim().slice(0, 80));
                inspectNode(node);
            }
        }
    }
});

observer.observe(document.body, { childList: true, subtree: true });
console.log("[RMR] MutationObserver watching for dynamic content");
