export { initLLMChat, initLLMButtons };

let chatHistory = [];
let currentResponse = null;
let pageName = "";

// Section identifiers that get "?" buttons
const SECTION_IDS = [
	"results-dashboard",
	"results-capacity",
	"results-transfers",
	"results-metrics",
	"results-admdis",
	"results-maps",
	"results-totalload",
	"results-load",
];

// ============================================================
// Chat Widget
// ============================================================

function initLLMChat(page) {
	pageName = page;

	// Don't create duplicate elements
	if (document.getElementById("llm-chat-button")) return;

	// Floating button
	const btn = document.createElement("button");
	btn.id = "llm-chat-button";
	btn.title = "Chat with AI assistant";
	btn.innerHTML = `<ion-icon name="chatbubble-ellipses-outline"></ion-icon>`;
	btn.addEventListener("click", toggleChatPanel);
	document.body.appendChild(btn);

	// Chat panel
	const panel = document.createElement("div");
	panel.id = "llm-chat-panel";
	panel.innerHTML = `
		<div id="llm-chat-header">
			<span>AI Assistant</span>
			<div id="llm-chat-header-actions">
				<button id="llm-chat-new" title="New chat">
					<ion-icon name="add-circle-outline"></ion-icon>
				</button>
				<button id="llm-chat-header-close">&times;</button>
			</div>
		</div>
		<div id="llm-chat-messages"></div>
		<div id="llm-chat-input-area">
			<textarea id="llm-chat-input" rows="1" placeholder="Ask about the results..."></textarea>
			<button id="llm-chat-send">Send</button>
		</div>
	`;
	document.body.appendChild(panel);

	// Event listeners
	panel.querySelector("#llm-chat-header-close").addEventListener("click", toggleChatPanel);
	panel.querySelector("#llm-chat-new").addEventListener("click", clearChat);
	panel.querySelector("#llm-chat-send").addEventListener("click", sendChatMessage);
	const input = panel.querySelector("#llm-chat-input");
	input.addEventListener("keydown", (e) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			sendChatMessage();
		}
	});
	// Auto-resize textarea
	input.addEventListener("input", () => {
		input.style.height = "auto";
		input.style.height = Math.min(input.scrollHeight, 100) + "px";
	});
}

function toggleChatPanel() {
	const panel = document.getElementById("llm-chat-panel");
	panel.classList.toggle("is-active");
	if (panel.classList.contains("is-active")) {
		document.getElementById("llm-chat-input").focus();
	}
}

function clearChat() {
	chatHistory = [];
	const messages = document.getElementById("llm-chat-messages");
	messages.innerHTML = "";
}

async function sendChatMessage() {
	const input = document.getElementById("llm-chat-input");
	const sendBtn = document.getElementById("llm-chat-send");
	const text = input.value.trim();
	if (!text) return;

	// Add user message to UI and history
	appendMessage("user", text);
	chatHistory.push({ role: "user", content: text });
	input.value = "";
	input.style.height = "auto";

	// Disable input while waiting
	sendBtn.disabled = true;
	const thinkingEl = showThinking();

	try {
		// Build context and detect visible section
		const context = buildContext();
		const visibleSection = findMostVisibleSection();

		const payload = {
			messages: chatHistory,
			context: context,
			figure_id: visibleSection || "",
		};

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 180000);

		const resp = await fetch("/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
			signal: controller.signal,
		});

		clearTimeout(timeoutId);
		const data = await resp.json();
		thinkingEl.remove();

		if (data.error) {
			appendMessage("assistant", "Sorry, I encountered an error: " + data.error);
		} else {
			appendMessage("assistant", data.response, data.reasoning);
			chatHistory.push({ role: "assistant", content: data.response });
		}
	} catch (err) {
		thinkingEl.remove();
		if (err.name === "AbortError") {
			appendMessage("assistant", "The request timed out. The AI service may be slow or unavailable.");
		} else {
			appendMessage("assistant", "Sorry, I could not reach the AI service. Please check that the server is running.");
		}
		console.error("Chat error:", err);
	}

	sendBtn.disabled = false;
	input.focus();
}

function appendMessage(role, content, reasoning) {
	const messages = document.getElementById("llm-chat-messages");
	const div = document.createElement("div");
	div.className = `llm-chat-message ${role}`;

	if (role === "assistant" && typeof marked !== "undefined") {
		let html = "";
		if (reasoning) {
			html += `<details class="llm-reasoning"><summary>Reasoning</summary>${marked.parse(reasoning)}</details>`;
		}
		html += marked.parse(content);
		div.innerHTML = html;
	} else {
		div.textContent = content;
	}

	messages.appendChild(div);
	messages.scrollTop = messages.scrollHeight;
}

function showThinking() {
	const messages = document.getElementById("llm-chat-messages");
	const div = document.createElement("div");
	div.className = "llm-chat-thinking";
	div.textContent = "Thinking...";
	messages.appendChild(div);
	messages.scrollTop = messages.scrollHeight;
	return div;
}

// ============================================================
// "?" Explain Buttons (Per-Figure)
// ============================================================

function initLLMButtons(response) {
	currentResponse = response;

	// Remove any existing explain buttons and inline explanation panels
	document.querySelectorAll(".llm-figure-explain-btn").forEach(el => el.remove());
	document.querySelectorAll(".llm-explain-inline").forEach(el => el.remove());

	for (const sectionId of SECTION_IDS) {
		const sectionContent = document.getElementById("section-" + sectionId);
		if (!sectionContent) continue;

		// Find all figure elements in this section
		const figures = sectionContent.querySelectorAll(".figure");

		if (figures.length > 0) {
			// Add a button after each figure
			for (const fig of figures) {
				const figureName = fig.getAttribute("figure-name") || "";
				const btn = createExplainButton(sectionId, fig, figureName);
				fig.parentNode.insertBefore(btn, fig.nextSibling);
			}
		} else {
			// Fallback: one button for the section (for sections without .figure elements)
			const btn = createExplainButton(sectionId, null, "");
			sectionContent.appendChild(btn);
		}
	}
}

function createExplainButton(sectionId, figureElement, figureName) {
	const btn = document.createElement("button");
	btn.type = "button";
	btn.className = "llm-figure-explain-btn";
	btn.innerHTML = `<ion-icon name="help-circle-outline"></ion-icon> Explain this figure`;
	btn.addEventListener("click", () => explainFigure(btn, sectionId, figureElement, figureName));
	return btn;
}

async function explainFigure(button, sectionId, figureElement, figureName) {
	// Check if there's already an inline explanation for this button
	let panel = button.nextElementSibling;
	if (panel && panel.classList.contains("llm-explain-inline")) {
		// Toggle visibility
		panel.classList.toggle("is-hidden");
		return;
	}

	// Create inline explanation panel
	panel = document.createElement("div");
	panel.className = "llm-explain-inline";

	// Get section title
	const sectionContent = document.getElementById("section-" + sectionId);
	const sectionHeader = sectionContent ? sectionContent.previousElementSibling : null;
	const headerText = sectionHeader ? sectionHeader.querySelector(".results-section-header-text") : null;
	const sectionTitle = headerText ? headerText.textContent : sectionId;

	panel.innerHTML = `
		<div class="llm-explain-inline-header">
			<span class="llm-explain-inline-title">${sectionTitle}</span>
			<button class="llm-explain-inline-close">&times;</button>
		</div>
		<div class="llm-explain-inline-body">
			<div class="llm-explain-spinner">Analyzing figure...</div>
		</div>
	`;

	button.parentNode.insertBefore(panel, button.nextSibling);

	panel.querySelector(".llm-explain-inline-close").addEventListener("click", () => {
		panel.classList.add("is-hidden");
	});

	const body = panel.querySelector(".llm-explain-inline-body");

	try {
		// Capture image from the specific figure element or section
		let imageData = null;
		try {
			if (figureElement) {
				imageData = await captureFigureImage(figureElement);
			} else {
				imageData = await captureSectionImage(sectionId);
			}
		} catch (imgErr) {
			console.warn("Could not capture figure image:", imgErr);
		}

		const context = buildContext();
		const userMessage = "Please analyze this figure and explain the key insights. What should a hospital administrator pay attention to? Are there any concerning patterns or actionable recommendations?";

		const payload = {
			messages: [{ role: "user", content: userMessage }],
			context: context,
			figure_id: sectionId,
			image_data: imageData,
		};

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 180000);

		const resp = await fetch("/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
			signal: controller.signal,
		});

		clearTimeout(timeoutId);
		const data = await resp.json();

		if (data.error) {
			body.textContent = "Error: " + data.error;
		} else if (typeof marked !== "undefined") {
			let html = "";
			if (data.reasoning) {
				html += `<details class="llm-reasoning"><summary>Reasoning</summary>${marked.parse(data.reasoning)}</details>`;
			}
			html += marked.parse(data.response);
			body.innerHTML = html;
		} else {
			body.textContent = data.response;
		}
	} catch (err) {
		if (err.name === "AbortError") {
			body.textContent = "The request timed out. The AI service may be slow or unavailable.";
		} else {
			body.textContent = "Could not reach the AI service. Please check that the server is running.";
		}
		console.error("Explain error:", err);
	}
}

// ============================================================
// Context Assembly
// ============================================================

function buildContext() {
	const ctx = {};

	// Read form parameters
	const startDate = document.getElementById("form-start-date");
	const endDate = document.getElementById("form-end-date");
	if (startDate) ctx.start_date = startDate.value;
	if (endDate) ctx.end_date = endDate.value;

	const patientType = document.getElementById("form-bed-type") || document.getElementById("form-patient-type");
	if (patientType) ctx.patient_type = patientType.options[patientType.selectedIndex].text;

	const objective = document.getElementById("form-objective");
	if (objective) ctx.objective = objective.options[objective.selectedIndex].text;

	const scenario = document.getElementById("form-scenario");
	if (scenario) ctx.scenario = scenario.options[scenario.selectedIndex].text;

	const utilization = document.getElementById("form-utilization");
	if (utilization) ctx.capacity_utilization = utilization.value;

	// Extract key metrics from stored response
	if (currentResponse) {
		if (currentResponse.config && currentResponse.config.node_names) {
			ctx.hospitals = currentResponse.config.node_names;
		}

		// Bed capacity
		if (currentResponse.config && currentResponse.config.capacity) {
			const beds = {};
			const names = currentResponse.config.node_names || [];
			const caps = currentResponse.config.capacity;
			if (Array.isArray(caps)) {
				names.forEach((h, i) => {
					if (i < caps.length) beds[h] = caps[i];
				});
			}
			if (Object.keys(beds).length > 0) ctx.beds = beds;
		}

		// Peak occupancy from summary
		if (currentResponse.summary) {
			const peaks = {};
			const summaryData = currentResponse.summary;
			if (summaryData.columns && summaryData.data) {
				const peakCol = summaryData.columns.indexOf("Peak Occupancy");
				const nameCol = summaryData.columns.indexOf("Hospital");
				if (peakCol >= 0 && nameCol >= 0) {
					for (const row of summaryData.data) {
						peaks[row[nameCol]] = row[peakCol];
					}
				}
			}
			if (Object.keys(peaks).length > 0) ctx.peak_occupancy = peaks;
		}

		// Total transfers
		if (currentResponse.total_transfers != null) {
			ctx.total_transfers = currentResponse.total_transfers;
		} else if (currentResponse.transfers) {
			// Try to compute from transfers data
			let total = 0;
			if (Array.isArray(currentResponse.transfers)) {
				for (const t of currentResponse.transfers) {
					total += (t.value || t.count || 0);
				}
			}
			if (total > 0) ctx.total_transfers = Math.round(total);
		}
	}

	return ctx;
}

// ============================================================
// Visible Section Detection
// ============================================================

function findMostVisibleSection() {
	let bestId = null;
	let bestVisible = 0;

	for (const sectionId of SECTION_IDS) {
		const el = document.getElementById("section-" + sectionId);
		if (!el || el.style.display === "none") continue;

		const rect = el.getBoundingClientRect();
		const viewportHeight = window.innerHeight;

		const top = Math.max(0, rect.top);
		const bottom = Math.min(viewportHeight, rect.bottom);
		const visibleHeight = Math.max(0, bottom - top);

		if (visibleHeight > bestVisible) {
			bestVisible = visibleHeight;
			bestId = sectionId;
		}
	}

	return bestId;
}

// ============================================================
// Image Capture
// ============================================================

async function captureFigureImage(element) {
	if (!element) return null;

	// The element itself should be an SVG or contain one
	let svg = element;
	if (svg.tagName.toLowerCase() !== "svg") {
		svg = element.querySelector("svg");
	}
	if (!svg) return null;

	return await renderSVGToPNG(svg);
}

async function captureSectionImage(sectionId) {
	const section = document.getElementById("section-" + sectionId);
	if (!section) return null;

	// Find the primary SVG: look for .figure first, then fall back to any svg
	let svg = section.querySelector(".figure");
	if (!svg) svg = section.querySelector("svg");
	if (!svg) return null;

	return await renderSVGToPNG(svg);
}

async function renderSVGToPNG(svg) {
	// Serialize SVG with embedded images
	const svgDataUrl = await getSVGDataForCapture(svg);

	// Convert to PNG via canvas at 2x scale
	const scaleFactor = 2.0;
	const width = svg.clientWidth || svg.getBoundingClientRect().width;
	const height = svg.clientHeight || svg.getBoundingClientRect().height;

	if (width === 0 || height === 0) return null;

	const canvas = new OffscreenCanvas(width * scaleFactor, height * scaleFactor);
	const ctx = canvas.getContext("2d");
	ctx.fillStyle = "white";
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	return new Promise((resolve) => {
		const img = new Image();
		img.onload = async () => {
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
			try {
				const blob = await canvas.convertToBlob({ type: "image/png" });
				const reader = new FileReader();
				reader.onloadend = () => resolve(reader.result);
				reader.readAsDataURL(blob);
			} catch (e) {
				console.warn("Canvas to blob failed:", e);
				resolve(null);
			}
		};
		img.onerror = () => resolve(null);
		img.src = svgDataUrl;
	});
}

async function getSVGDataForCapture(svg) {
	// Encode embedded <image> elements to data URLs
	let imgCvt = {};
	for (const imgNode of svg.querySelectorAll("image")) {
		const u = imgNode.href.baseVal;
		if (u && imgCvt[u] == null) {
			try {
				imgCvt[u] = await encodeImageForCapture(u);
			} catch (e) {
				console.warn("Could not encode image:", u, e);
			}
		}
	}

	let serializer = new XMLSerializer();
	let source = serializer.serializeToString(svg);

	// Replace image URLs with data URLs
	for (const k in imgCvt) {
		const v = imgCvt[k];
		if (v) source = source.replaceAll(k, v);
	}

	// Ensure proper SVG namespaces
	if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
		source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
	}
	if (!source.match(/^<svg[^>]+"http:\/\/www\.w3\.org\/1999\/xlink"/)) {
		source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
	}
	source = '<?xml version="1.0" standalone="no"?>\r\n' + source;

	return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);
}

function encodeImageForCapture(imgURL) {
	return new Promise((resolve, reject) => {
		const canvas = document.createElement("canvas");
		canvas.style.display = "none";
		canvas.width = 1024;
		canvas.height = 1024;
		document.body.appendChild(canvas);

		const ctx = canvas.getContext("2d");
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () => {
			ctx.drawImage(img, 0, 0);
			const dataURL = canvas.toDataURL("image/png");
			canvas.remove();
			resolve(dataURL);
		};
		img.onerror = () => {
			canvas.remove();
			reject(new Error("Failed to load image: " + imgURL));
		};
		img.src = imgURL;
	});
}
