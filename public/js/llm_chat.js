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
			<button id="llm-chat-header-close">&times;</button>
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

	// Explain modal (shared)
	if (!document.getElementById("llm-explain-modal")) {
		const modal = document.createElement("div");
		modal.id = "llm-explain-modal";
		modal.innerHTML = `
			<div id="llm-explain-modal-content">
				<button id="llm-explain-modal-close">&times;</button>
				<div id="llm-explain-modal-title"></div>
				<div id="llm-explain-modal-body"></div>
			</div>
		`;
		document.body.appendChild(modal);
		modal.querySelector("#llm-explain-modal-close").addEventListener("click", closeExplainModal);
		modal.addEventListener("click", (e) => {
			if (e.target === modal) closeExplainModal();
		});
	}
}

function toggleChatPanel() {
	const panel = document.getElementById("llm-chat-panel");
	panel.classList.toggle("is-active");
	if (panel.classList.contains("is-active")) {
		document.getElementById("llm-chat-input").focus();
	}
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

		const resp = await fetch("/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		const data = await resp.json();
		thinkingEl.remove();

		if (data.error) {
			appendMessage("assistant", "Sorry, I encountered an error: " + data.error);
		} else {
			const responseText = data.response;
			appendMessage("assistant", responseText);
			chatHistory.push({ role: "assistant", content: responseText });
		}
	} catch (err) {
		thinkingEl.remove();
		appendMessage("assistant", "Sorry, I could not reach the AI service. Please check that the server is running.");
		console.error("Chat error:", err);
	}

	sendBtn.disabled = false;
	input.focus();
}

function appendMessage(role, content) {
	const messages = document.getElementById("llm-chat-messages");
	const div = document.createElement("div");
	div.className = `llm-chat-message ${role}`;

	if (role === "assistant" && typeof marked !== "undefined") {
		div.innerHTML = marked.parse(content);
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
// "?" Explain Buttons
// ============================================================

function initLLMButtons(response) {
	currentResponse = response;

	// Remove any existing explain buttons first
	document.querySelectorAll(".llm-figure-explain-btn").forEach(el => el.remove());

	for (const sectionId of SECTION_IDS) {
		const sectionContent = document.getElementById("section-" + sectionId);
		if (!sectionContent) continue;

		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "llm-figure-explain-btn";
		btn.innerHTML = `<ion-icon name="help-circle-outline"></ion-icon> Explain this figure`;
		btn.addEventListener("click", () => explainSection(sectionId));
		sectionContent.appendChild(btn);
	}
}

async function explainSection(sectionId) {
	const modal = document.getElementById("llm-explain-modal");
	const title = document.getElementById("llm-explain-modal-title");
	const body = document.getElementById("llm-explain-modal-body");

	// Get section title from header
	const sectionContent = document.getElementById("section-" + sectionId);
	const sectionHeader = sectionContent ? sectionContent.previousElementSibling : null;
	const headerText = sectionHeader ? sectionHeader.querySelector(".results-section-header-text") : null;
	const sectionTitle = headerText ? headerText.textContent : sectionId;

	title.textContent = sectionTitle;
	body.innerHTML = `<div class="llm-explain-spinner">Analyzing figure...</div>`;
	modal.classList.add("is-active");

	try {
		// Capture image from the section
		let imageData = null;
		try {
			imageData = await captureSectionImage(sectionId);
		} catch (imgErr) {
			console.warn("Could not capture section image:", imgErr);
		}

		const context = buildContext();
		const userMessage = "Please analyze this figure and explain the key insights. What should a hospital administrator pay attention to? Are there any concerning patterns or actionable recommendations?";

		const payload = {
			messages: [{ role: "user", content: userMessage }],
			context: context,
			figure_id: sectionId,
			image_data: imageData,
		};

		const resp = await fetch("/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		const data = await resp.json();

		if (data.error) {
			body.textContent = "Error: " + data.error;
		} else if (typeof marked !== "undefined") {
			body.innerHTML = marked.parse(data.response);
		} else {
			body.textContent = data.response;
		}
	} catch (err) {
		body.textContent = "Could not reach the AI service. Please check that the server is running.";
		console.error("Explain error:", err);
	}
}

function closeExplainModal() {
	document.getElementById("llm-explain-modal").classList.remove("is-active");
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

async function captureSectionImage(sectionId) {
	const section = document.getElementById("section-" + sectionId);
	if (!section) return null;

	// Find the primary SVG: look for .figure first, then fall back to any svg
	let svg = section.querySelector(".figure");
	if (!svg) svg = section.querySelector("svg");
	if (!svg) return null;

	// Serialize SVG with embedded images (adapted from figuredl.js pattern)
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
