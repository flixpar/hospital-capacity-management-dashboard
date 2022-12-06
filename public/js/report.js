import {createCapacityTimeline} from "./capacity_timeline.js";
import {createTransfersBreakdownPlot} from "./transfers.js";
import {createAdmissionSimsTableOnly} from "./metrics.js";


function handleResponse(response) {
	response.icu.capacity_levels = response.icu.capacity;
	response.acute.capacity_levels = response.acute.capacity;
	console.log(response);

	document.querySelectorAll(".fillvalue").forEach(e => {
		const metricName = e.textContent;
		const value = computeValue(response, metricName);
		if (value != null) {
			e.textContent = value;
			e.classList.add("filled");
		}
	});

	createCapacityTimeline(response.icu, false);
	createTransfersBreakdownPlot(response.icu, false);

	createAdmissionSimsTableOnly(response.icu, "admission-sims-icu-table-container");
	createAdmissionSimsTableOnly(response.acute, "admission-sims-acute-table-container");

	document.getElementById("results-container").remove();
}

function computeValue(response, metricName) {
	if (metricName == "SCENARIO") {
		return response.meta.scenario;
	} else if (metricName == "OPERATIONALOCCUPANCY") {
		return response.meta.capacity_util;
	} else if (metricName == "FORECASTDATE") {
		return response.meta.forecast_date;
	} else if (metricName == "TIMEPERIOD") {
		return response.meta.start_date + " to " + response.meta.end_date;
	} else if (metricName == "SURGEREDUCTION-ICU") {
		const N = response.icu.config.node_names.length;
		const overflow_byloc = d3.range(N).map(i => response.icu.occupancy[i].map(x => Math.max(0, x - response.icu.beds[i])));
		const overflow_notfr_byloc = d3.range(N).map(i => response.icu.occupancy_notfr[i].map(x => Math.max(0, x - response.icu.beds[i])));
		const overflow_notfr = d3.sum(d3.merge(overflow_notfr_byloc));
		const overflow_wtfr = d3.sum(d3.merge(overflow_byloc));
		const overflow_reduction = (overflow_notfr - overflow_wtfr) / overflow_notfr;
		return (overflow_reduction*100).toFixed(1) + "%";
	} else if (metricName == "SURGE-NOTRANSFERS-ICU") {
		const N = response.icu.config.node_names.length;
		const overflow_notfr_byloc = d3.range(N).map(i => response.icu.occupancy_notfr[i].map(x => Math.max(0, x - response.icu.beds[i])));
		const overflow_notfr = d3.sum(d3.merge(overflow_notfr_byloc));
		return overflow_notfr.toFixed(0);
	} else if (metricName == "SURGE-TRANSFERS-ICU") {
		const N = response.icu.config.node_names.length;
		const overflow_byloc = d3.range(N).map(i => response.icu.occupancy[i].map(x => Math.max(0, x - response.icu.beds[i])));
		const overflow_wtfr = d3.sum(d3.merge(overflow_byloc));
		return overflow_wtfr.toFixed(0);
	} else if (metricName == "TRANSFERBUDGET-ICU") {
		return response.icu.transfer_budget;
	} else if (metricName == "TRANSFERBUDGET-ACUTE") {
		return response.acute.transfer_budget;
	}

	return null;
}

function ajaxErrorHandler() {
	$("#error-area").removeClass("is-hidden");
	$("#progressbar-area").hide();
	document.getElementById("results-container").innerHTML = "";
}

function sendUpdateQuery() {
	console.log("Querying server...");
	$.ajax({
		url: "/api/report",
		type: "get",
		dataType: "json",
		success: handleResponse,
		error: ajaxErrorHandler,
	});
}
sendUpdateQuery();
