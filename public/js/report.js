function handleResponse(response) {
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

	createAdmissionSimsTable(response.icu, "admission-sims-icu-table-container");
	createAdmissionSimsTable(response.ward, "admission-sims-acute-table-container");

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
		const overflow_byloc = d3.range(N).map(i => response.icu.active[i].map(x => Math.max(0, x - response.icu.beds[i])));
		const overflow_nosent_byloc = d3.range(N).map(i => response.icu.active_null[i].map(x => Math.max(0, x - response.icu.beds[i])));
		const overflow_nosent = d3.sum(d3.merge(overflow_nosent_byloc));
		const overflow_sent = d3.sum(d3.merge(overflow_byloc));
		const overflow_reduction = (overflow_nosent - overflow_sent) / overflow_nosent;
		return (overflow_reduction*100).toFixed(1) + "%";
	} else if (metricName == "SURGE-NOTRANSFERS-ICU") {
		const N = response.icu.config.node_names.length;
		const overflow_nosent_byloc = d3.range(N).map(i => response.icu.active_null[i].map(x => Math.max(0, x - response.icu.beds[i])));
		const overflow_nosent = d3.sum(d3.merge(overflow_nosent_byloc));
		return overflow_nosent.toFixed(0);
	} else if (metricName == "SURGE-TRANSFERS-ICU") {
		const N = response.icu.config.node_names.length;
		const overflow_byloc = d3.range(N).map(i => response.icu.active[i].map(x => Math.max(0, x - response.icu.beds[i])));
		const overflow_sent = d3.sum(d3.merge(overflow_byloc));
		return overflow_sent.toFixed(0);
	} else if (metricName == "TRANSFERBUDGET-ICU") {
		return response.icu.transfer_budget;
	} else if (metricName == "TRANSFERBUDGET-ACUTE") {
		return response.ward.transfer_budget;
	}

	return null;
}

function createAdmissionSimsTable(response, sectionName) {
	const tableData = response.admission_sims.table;

	let table = document.createElement("table");
	table.className = "table is-hoverable";
	document.getElementById(sectionName).appendChild(table);

	let tableHeader = document.createElement("thead");
	let tableBody = document.createElement("tbody");
	table.appendChild(tableHeader);
	table.appendChild(tableBody);

	let tableHeaderRow = document.createElement("tr");
	tableHeader.appendChild(tableHeaderRow);

	let blank = document.createElement("th");
	tableHeaderRow.appendChild(blank);

	for (capacitylevel of tableData.capacitylevel) {
		let th = document.createElement("th");
		th.textContent = capacitylevel;
		tableHeaderRow.appendChild(th);
	}

	let elem = document.createElement("th");
	elem.textContent = "Current";
	tableHeaderRow.appendChild(elem);

	response.config.node_names.forEach((h,i) => {
		let row = document.createElement("tr");
		tableBody.appendChild(row);

		let nameEntry = document.createElement("th");
		nameEntry.textContent = h;
		row.appendChild(nameEntry);

		const currentLevel = response.admission_sims.current_admissions[i].toFixed(0);

		for (v of tableData[h]) {
			let td = document.createElement("td");
			td.textContent = (v == -1) ? 0 : v;
			td.style.color = (v < currentLevel) ? "red" : "green";
			row.appendChild(td);
		}

		let elem = document.createElement("td");
		elem.textContent = currentLevel;
		elem.style.fontWeight = "bold";
		row.appendChild(elem);
	});
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
		success: handleResponse,
		error: ajaxErrorHandler,
	});
}
sendUpdateQuery();
