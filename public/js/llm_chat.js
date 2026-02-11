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

	// ── Form parameters ──
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

	const losEl = document.getElementById("form-los");
	if (losEl) {
		if (losEl.tagName === "SELECT") {
			ctx.length_of_stay = losEl.options[losEl.selectedIndex].text;
		} else {
			ctx.length_of_stay = losEl.value;
		}
	}

	// Transfer budgets
	const tfrTotal = document.getElementById("form-transferbudget-total");
	if (tfrTotal) ctx.transfer_budget_total = tfrTotal.value;

	// Per-hospital transfer budgets
	const tfrBudgets = {};
	document.querySelectorAll("[id^='form-transferbudget-']").forEach(el => {
		const key = el.id.replace("form-transferbudget-", "").toUpperCase();
		if (key !== "TOTAL") tfrBudgets[key] = el.value;
	});
	if (Object.keys(tfrBudgets).length > 0) ctx.transfer_budgets_per_hospital = tfrBudgets;

	// ── Extract data from stored response ──
	if (!currentResponse) return ctx;

	const r = currentResponse;
	const names = (r.config && r.config.node_names) || [];
	const N = names.length;
	ctx.hospitals = names;

	const dates = (r.config && r.config.dates) || [];
	const T = dates.length;
	ctx.num_days = T;

	// Capacity level names
	if (r.config && r.config.capacity_names) {
		ctx.capacity_level_names = r.config.capacity_names;
	}

	// Region
	if (r.config && r.config.region && r.config.region.region_fullname) {
		ctx.region = r.config.region.region_fullname;
	}

	// Page type
	ctx.page = pageName;

	// ── Per-hospital capacity (multi-level) ──
	// r.capacity[i] is an array of capacity levels for hospital i
	// r.capacity_levels is the same thing (set in patients.js)
	const cap = r.capacity_levels || r.capacity;
	if (cap && Array.isArray(cap) && N > 0) {
		const hospitalCapacity = {};
		for (let i = 0; i < N; i++) {
			if (i < cap.length && Array.isArray(cap[i])) {
				const capNames = (r.config && r.config.capacity_names) || [];
				const levels = {};
				for (let c = 0; c < cap[i].length; c++) {
					const levelName = capNames[c] || `Level ${c}`;
					levels[levelName] = Math.round(cap[i][c]);
				}
				hospitalCapacity[names[i]] = levels;
			}
		}
		if (Object.keys(hospitalCapacity).length > 0) ctx.hospital_capacity = hospitalCapacity;
	}

	// ── Occupancy statistics (with and without transfers) ──
	if (r.occupancy && r.occupancy_notfr && N > 0 && T > 0) {
		const hospStats = {};
		let systemOccWithTfr = new Array(T).fill(0);
		let systemOccNoTfr = new Array(T).fill(0);

		for (let i = 0; i < N; i++) {
			const occW = r.occupancy[i] || [];
			const occN = r.occupancy_notfr[i] || [];

			const peakW = Math.round(d3.max(occW) || 0);
			const peakN = Math.round(d3.max(occN) || 0);
			const medianW = Math.round(d3.median(occW) || 0);
			const medianN = Math.round(d3.median(occN) || 0);

			// Baseline capacity (level 0)
			const baseCap = (cap && cap[i] && cap[i][0]) ? Math.round(cap[i][0]) : null;

			const stats = {
				peak_occupancy_with_transfers: peakW,
				peak_occupancy_without_transfers: peakN,
				median_occupancy_with_transfers: medianW,
				median_occupancy_without_transfers: medianN,
			};
			if (baseCap !== null) {
				stats.baseline_capacity = baseCap;
				stats.peak_load_with_transfers = +(peakW / baseCap).toFixed(2);
				stats.peak_load_without_transfers = +(peakN / baseCap).toFixed(2);
				stats.surge_needed_with_transfers = Math.max(0, peakW - baseCap);
				stats.surge_needed_without_transfers = Math.max(0, peakN - baseCap);
			}

			hospStats[names[i]] = stats;

			for (let t = 0; t < T; t++) {
				systemOccWithTfr[t] += (occW[t] || 0);
				systemOccNoTfr[t] += (occN[t] || 0);
			}
		}
		ctx.hospital_stats = hospStats;

		// System-level load stats
		const totalBaseCap = (cap && Array.isArray(cap))
			? d3.sum(cap, c => (Array.isArray(c) && c[0]) ? c[0] : 0)
			: 0;

		ctx.system_stats = {
			peak_occupancy_with_transfers: Math.round(d3.max(systemOccWithTfr)),
			peak_occupancy_without_transfers: Math.round(d3.max(systemOccNoTfr)),
			median_occupancy_with_transfers: Math.round(d3.median(systemOccWithTfr)),
			median_occupancy_without_transfers: Math.round(d3.median(systemOccNoTfr)),
			total_baseline_capacity: Math.round(totalBaseCap),
		};
		if (totalBaseCap > 0) {
			ctx.system_stats.peak_load_with_transfers = +(d3.max(systemOccWithTfr) / totalBaseCap).toFixed(2);
			ctx.system_stats.peak_load_without_transfers = +(d3.max(systemOccNoTfr) / totalBaseCap).toFixed(2);
			ctx.system_stats.system_surge_needed_with_transfers = Math.max(0, Math.round(d3.max(systemOccWithTfr) - totalBaseCap));
			ctx.system_stats.system_surge_needed_without_transfers = Math.max(0, Math.round(d3.max(systemOccNoTfr) - totalBaseCap));
		}

		// Find peak dates
		const peakIdxW = systemOccWithTfr.indexOf(d3.max(systemOccWithTfr));
		const peakIdxN = systemOccNoTfr.indexOf(d3.max(systemOccNoTfr));
		if (dates[peakIdxW]) ctx.system_stats.peak_date_with_transfers = dates[peakIdxW];
		if (dates[peakIdxN]) ctx.system_stats.peak_date_without_transfers = dates[peakIdxN];
	}

	// ── Total transfers ──
	if (r.transfers && Array.isArray(r.transfers)) {
		const totalTfr = d3.sum(r.transfers, x => d3.sum(x, z => d3.sum(z)));
		ctx.total_transfers = Math.round(totalTfr);

		// Per-hospital sent/received
		if (N > 0) {
			const sent = {};
			const received = {};
			// transfers is [T][dest][source]
			for (let i = 0; i < N; i++) {
				let totalSent = 0;
				let totalRecv = 0;
				for (let t = 0; t < r.transfers.length; t++) {
					for (let j = 0; j < N; j++) {
						if (r.transfers[t] && r.transfers[t][j]) {
							totalSent += (r.transfers[t][j][i] || 0);  // source=i
						}
						if (r.transfers[t] && r.transfers[t][i]) {
							totalRecv += (r.transfers[t][i][j] || 0);  // dest=i
						}
					}
				}
				sent[names[i]] = Math.round(totalSent);
				received[names[i]] = Math.round(totalRecv);
			}
			ctx.transfers_sent = sent;
			ctx.transfers_received = received;

			// Largest transfer routes
			const routes = {};
			for (let src = 0; src < N; src++) {
				for (let dst = 0; dst < N; dst++) {
					if (src === dst) continue;
					let routeTotal = 0;
					for (let t = 0; t < r.transfers.length; t++) {
						if (r.transfers[t] && r.transfers[t][dst]) {
							routeTotal += (r.transfers[t][dst][src] || 0);
						}
					}
					if (routeTotal > 0.5) {
						routes[`${names[src]} → ${names[dst]}`] = Math.round(routeTotal);
					}
				}
			}
			ctx.transfer_routes = routes;
		}
	} else if (r.total_transfers != null) {
		ctx.total_transfers = r.total_transfers;
	}

	// ── Total patients ──
	if (r.total_patients != null) {
		ctx.total_patients = r.total_patients;
	}

	// ── Admissions stats ──
	if (r.admissions && N > 0) {
		const admStats = {};
		for (let i = 0; i < N; i++) {
			const adm = r.admissions[i] || [];
			admStats[names[i]] = {
				peak_daily_admissions: Math.round(d3.max(adm) || 0),
				mean_daily_admissions: +(d3.mean(adm) || 0).toFixed(1),
				total_admissions: Math.round(d3.sum(adm)),
			};
		}
		ctx.admission_stats = admStats;
	}

	// ── Surge capacity detail (max required capacity level per hospital) ──
	if (cap && r.occupancy && N > 0) {
		const surgeDetail = {};
		const capNames = (r.config && r.config.capacity_names) || [];
		const C = (cap[0] && cap[0].length) || 0;
		for (let i = 0; i < N; i++) {
			const peakOcc = d3.max(r.occupancy[i] || []) || 0;
			let reqLevel = C - 1;
			for (let c = 0; c < C; c++) {
				if (cap[i][c] >= peakOcc) { reqLevel = c; break; }
			}
			surgeDetail[names[i]] = capNames[reqLevel] || `Level ${reqLevel}`;
		}
		ctx.required_capacity_levels = surgeDetail;
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
