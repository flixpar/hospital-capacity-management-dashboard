console.log("Starting!");

import * as common from "./common.js";
import {createMap} from "./map_plots.js";
import {createJHHSDashboard} from "./dashboard.js";
import {createTransfersBreakdownPlot} from "./transfers.js";
import {createAdmissionsPlot} from "./admitted.js";
import {createDischargedPlot} from "./discharged.js";
import {createCapacityTimeline} from "./capacity_timeline.js";
import {createOverallLoadPlot, createLoadPlots} from "./loadplots.js";
import {createTransfersSankey} from "./transfers_sankey.js";
import {createRidgePlot} from "./ridgeplot.js";
import {createOccupancyPlot} from "./occupancyplot.js";
import {createStatsSummary, createSurgeCapacityMetrics, createAdmissionSimsTable} from "./metrics.js";
import {setupTable, setupTableFilter, setupTableDownloads} from "./tables.js";
import {generateAllFigureDownloadButtons} from "./figuredl.js";

let container = document.getElementById("result-area");
export let recentResponse = null;


function handleResponse(response, status, xhr) {
	console.log("Updating...");
	hideProgressbar();
	container.innerHTML = "";

	response.beds = response.capacity_levels.map(x => x[0]);

	recentResponse = response;

	makeSections();

	let section = common.getSection("casestudy-info");
	let sectionContainer = section.parentElement;
	sectionContainer.remove();

	createStatsSummary(response);
	createSurgeCapacityMetrics(response);

	createMap(response, "overflow_dynamic", "transfers");

	createJHHSDashboard(response);
	createCapacityTimeline(response);

	createTransfersSankey(response);
	createTransfersBreakdownPlot(response);

	createAdmissionsPlot(response);
	createOccupancyPlot(response);
	createOverallLoadPlot(response);
	createLoadPlots(response);

	// createAdmissionSimsTable(response, false);

	// setupTable(response.summary, true, "summary-table", "Summary Statistics");
	// setupTable(response.full_results, true, "full-table", "Full Results");
	// setupTableFilter("full-table");
	// setupTableDownloads(response);

	updateText(response);
	generateAllFigureDownloadButtons();

	console.log("Done.");
}

function makeSections() {
	const sectionInfo = [
		{title: "Info",                                   identifier: "casestudy-info",      showDefault: true},
		{title: "Occupancy Timeline",                     identifier: "results-dashboard",   showDefault: true},
		{title: "Recommended Transfers",                  identifier: "results-transfers",   showDefault: true},
		{title: "Metrics",                                identifier: "results-metrics",     showDefault: true},
		{title: "Admissions",                             identifier: "results-admdis",      showDefault: true},
		{title: "Required Surge Capacity Map",            identifier: "results-maps",        showDefault: true},
		{title: "System Load",                            identifier: "results-totalload",   showDefault: true},
		{title: "Hospital Loads",                         identifier: "results-load",        showDefault: true},
		{title: "Hospital Occupancy",                     identifier: "results-occupancy",      showDefault: false},
		{title: "Raw Results",                            identifier: "results-raw",         showDefault: false},
	]

	for (const s of sectionInfo) {
		makeSection(s)
	}
}

function makeSection(sectionInfo) {
	let sectionContainer = document.createElement("div");
	let sectionHeader = document.createElement("div");
	let sectionHeaderText = document.createElement("h3");
	let sectionContent = document.createElement("div");

	sectionContainer.className = "results-section";
	sectionContent.className = "results-section-content is-collapsible";
	sectionHeader.className = "results-section-header";
	sectionHeaderText.className = "title is-3 results-section-header-text";

	const sectionID = "section-" + sectionInfo.identifier;
	sectionContent.id = sectionID;

	sectionHeaderText.innerText = sectionInfo.title;
	sectionHeader.appendChild(sectionHeaderText);

	let toggleButton = document.createElement("a");
	toggleButton.className = "section-toggle-button";
	toggleButton.dataset.target = sectionID;
	const iconDir = sectionInfo.showDefault ? "chevron-down-outline" : "chevron-back-outline";
	toggleButton.innerHTML = `
		<span class="icon section-toggle-icon">
			<ion-icon name="${iconDir}"></ion-icon>
		</span>
	`;
	sectionHeader.appendChild(toggleButton);

	sectionHeader.dataset.target = sectionID;
	sectionHeader.addEventListener("click", function(e) {
		e.stopPropagation();
		const i = this.dataset.target;
		const c = document.getElementById(i);
		const icon = this.querySelector("ion-icon");
		if (c.style.display != "none") {
			c.style.display = "none";
			icon.setAttribute("name", "chevron-back-outline");
		} else {
			c.style.display = "block";
			icon.setAttribute("name", "chevron-down-outline");
		}
	});

	if (!sectionInfo.showDefault) {
		sectionContent.style.display = "none";
	}

	sectionContainer.appendChild(sectionHeader);
	sectionContainer.appendChild(sectionContent);

	document.getElementById("result-area").appendChild(sectionContainer);
}

function showProgressbar() {
	$("#progressbar-area").show();
	container.innerHTML = "";
}

function hideProgressbar() {
	$("#progressbar-area").hide();
}

function ajaxErrorHandler() {
	$("#error-area").removeClass("is-hidden");
	$("#progressbar-area").hide();
	container.innerHTML = "";
}

function setDefaultDates() {
	// let start_date = new Date();
	// let end_date   = new Date();
	// end_date.setMonth(end_date.getMonth() + 2);
	const start_date = new Date("2021-12-15");
	const end_date = new Date("2022-02-15");
	document.getElementById("form-start-date").value = start_date.toISOString().slice(0, 10);
	document.getElementById("form-end-date").value = end_date.toISOString().slice(0, 10);
}
setDefaultDates();

function setDefaultTransferBudget() {
	const hospital_extensions = ["bmc", "hcgh", "jhh", "sh", "smh", "total"];
	const bedtype = document.getElementById("form-bed-type").value;

	let defaultvalue = 10;
	if (bedtype == "all") {
		defaultvalue = 40;
	} else if (bedtype == "icu") {
		defaultvalue = 15;
	} else if (bedtype == "ward") {
		defaultvalue = 25;
	}

	hospital_extensions.forEach(h => {
		document.getElementById(`form-transferbudget-${h}`).value = defaultvalue;
	});
	document.getElementById("form-transferbudget-total").value = 250;
}
setDefaultTransferBudget();
document.getElementById("form-bed-type").addEventListener("change", setDefaultTransferBudget);

function constrainPatientType() {
	const scenario = document.getElementById("form-scenario").value;
	if (scenario == "shortterm") {
		document.getElementById("form-bed-type").value = "all";
		document.getElementById("form-bed-type").disabled = true;
	} else {
		document.getElementById("form-bed-type").disabled = false;
	}
}
constrainPatientType();
document.getElementById("form-scenario").addEventListener("change", constrainPatientType);

function validateForm() {
	const data_start_date = "2020-03-25";
	const data_end_date   = "2022-02-16";

	const start_date = new Date(Date.parse(document.getElementById("form-start-date").value));
	const end_date   = new Date(Date.parse(document.getElementById("form-end-date").value));

	const dates_valid = (new Date(data_start_date) <= start_date) && (end_date < new Date(data_end_date));
	if (!dates_valid) {
		const valid_range_str = `${data_start_date} to ${data_end_date}`;
		alert(`Date selection outside of valid range. Valid date range for ${region} is ${valid_range_str}.`);
	}

	const scenario = document.getElementById("form-scenario").value;
	const patient_type = document.getElementById("form-bed-type").value;
	const patient_type_valid = !(scenario == "shortterm" && patient_type != "all");
	if (!patient_type_valid) {
		alert("Scenario Short-Term only available for patient type All.")
	}

	return dates_valid && patient_type_valid;
}

function sendUpdateQuery() {
	if (!validateForm()) {
		return;
	}
	const surgepreferences = {
		bmc: document.getElementById("form-surgepreferences-bmc").value,
		hcgh: document.getElementById("form-surgepreferences-hcgh").value,
		jhh: document.getElementById("form-surgepreferences-jhh").value,
		sh: document.getElementById("form-surgepreferences-sh").value,
		smh: document.getElementById("form-surgepreferences-smh").value,
	};
	const transferBudget = {
		bmc: document.getElementById("form-transferbudget-bmc").value,
		hcgh: document.getElementById("form-transferbudget-hcgh").value,
		jhh: document.getElementById("form-transferbudget-jhh").value,
		sh: document.getElementById("form-transferbudget-sh").value,
		smh: document.getElementById("form-transferbudget-smh").value,
		total: document.getElementById("form-transferbudget-total").value,
	};
	const data = {
		start_date: $("#form-start-date")[0].value,
		end_date: $("#form-end-date")[0].value,
		patient_type: $("#form-patient-type")[0].value,
		bed_type: $("#form-bed-type")[0].value,
		forecast_scenario: $("#form-scenario")[0].value,

		objective: $("#form-objective")[0].value,
		capacity_type: $("#form-capacity-type")[0].value,
		integer: $("#form-integer")[0].value,

		transferbudget: transferBudget,
		surgepreferences: surgepreferences,
		utilization: ($("#form-utilization")[0].value / 100).toString(),

		uncertaintylevel: $("#form-uncertainty")[0].value,
		los: $("#form-los")[0].value,
	};
	console.log("Querying server...");
	$.ajax({
		url: "/api/recommendations",
		type: "post",
		contentType: "application/json; charset=utf-8",
		dataType: "json",
		data: JSON.stringify(data),
		success: handleResponse,
		beforeSend: showProgressbar,
		error: ajaxErrorHandler,
	});
}
$("#form-submit").click(sendUpdateQuery);
sendUpdateQuery();

const tooltip_content = {
	"form-start-date": "Date to start the patient allocation model.",
	"form-end-date"  : "Date to end the patient allocation model.",
	"form-los"       : "Expected number of days that a patient will have to stay in the hospital.",
	"form-patient-type": "Restrict focus to a certain patient population.",
	"form-bed-type"  : "Restrict focus to beds of a certain type.",
	"form-scenario": "Forecast scenario to use.",
	"form-objective": "Which decisions the model should optimize.",
	"form-capacity-type": "Whether to open surge capacity in levels or individual beds.",
	"form-weights": "Preferences for where to transfer patients to if the system runs out of capacity.",
	"form-transferbudget-total": "Maximum number of patients that can be transferred between all hospitls in a day.",
	"form-transferbudget": "Maximum number of patients that can be transferred from the given hospital in a day.",
	"form-surgepreferences": "Preference for where to create additional capacity if it is necessary.",
	"form-utilization": "Percentage of the total capacity that can be used in practice.",
	"form-uncertainty": "Level of uncertainty in the forcast that we should plan for.",
	"form-integer": "Use the mixed-integer programming formulation or not. Not recommended as solving the model may take much longer.",
};
$("#form label").each((i, el) => {
	const k = el.getAttribute("for");
	if (k in tooltip_content) {
		common.createInfo(el, tooltip_content[k]);
	}
});

function updateText(response) {
	// enableHiddenTextButtons();

	const isMobile = (window.innerWidth < 600);

	let mapTitle = `COVID-19 Capacity, Occupancy, and Optimal Transfers in JHHS`;
	if (isMobile) {mapTitle = `COVID-19 Occupancy, and Optimal Transfers`;}
	for (let map of document.querySelectorAll(".hospitalsmap")) {
		const metric = map.id.substring(13);
		if (metric.indexOf("_both") > 0) {
			map.querySelector(".map-title").textContent = mapTitle;
		} else {
			map.querySelector(".map-subtitle").textContent = mapTitle;
		}
	}

	for (let elem of document.querySelectorAll(".region-text")) {
		elem.textContent = "JHHS";
	}

	for (let elem of document.querySelectorAll(".fill-value")) {
		const contentid = elem.dataset.contentid;
		if (contentid == "start_date") {
			elem.textContent = response.config.start_date;
		} else if (contentid == "end_date") {
			elem.textContent = response.config.end_date;
		}
	}

	for (let elem of document.querySelectorAll(".abbrev-text")) {
		const fulltext = elem.dataset.fulltext;
		elem.setAttribute("data-tippy-content", fulltext);
		tippy(elem, {delay: [null, 250]});
	}

	for (let elem of document.querySelectorAll(".info-text")) {
		const text = elem.textContent;
		const info = createInfo(null, text);
		elem.replaceWith(info);
	}
}
