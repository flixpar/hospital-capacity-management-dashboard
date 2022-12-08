export {createStatsSummary, createSurgeCapacityMetrics, createAdmissionTargetsTable, createAdmissionTargetsTableRaw};

import {getSection, createSelect} from "./common.js";
import {metricsDescription} from "./figure_text.js";

const add_description = false;


function createSurgeCapacityMetrics(rawdata, capacityLevel=0) {
	const N = rawdata.config.node_names.length;
	const T = rawdata.config.dates.length;
	const C = rawdata.capacity[0].length;
	const nDecimals = 0;

	const max_occupancy_wtfr = d3.range(N).map(i => d3.max(rawdata.occupancy[i]));
	const max_occupancy_notfr = d3.range(N).map(i => d3.max(rawdata.occupancy_notfr[i]));
	const max_overflows_wtfr = max_occupancy_wtfr.map((a,i) => Math.max(0, a - rawdata.capacity[i][capacityLevel]));
	const max_overflows_notfr = max_occupancy_notfr.map((a,i) => Math.max(0, a - rawdata.capacity[i][capacityLevel]));
	const max_capacitylevels_wtfr = max_occupancy_wtfr.map((m,i) => rawdata.capacity[i].findIndex(c => c > m)).map(x => (x == -1) ? C-1 : Math.max(0, x-1));

	let table = document.createElement("table");
	table.id = "surgemetrics-table";
	table.className = "table is-hoverable";
	table.style.marginLeft = "auto";
	table.style.marginRight = "auto";

	let tableBody = document.createElement("tbody");
	table.appendChild(tableBody);

	let rows = [];
	function addColumn(values) {
		const nVals = values.length;
		for (let i = 0; i < nVals; i++) {
			if (rows[i] == null) {
				rows[i] = document.createElement("tr");
			}

			let elem = document.createElement("td");

			const val = values[i];
			if (val != null && typeof val == "number") {
				elem.innerText = val.toFixed(nDecimals);
			} else {
				elem.innerText = val;
			}

			rows[i].appendChild(elem);
		}
	}

	addColumn(["Hospital", "Required Surge Capacity With Transfers (Beds)", "Required Surge Capacity Without Transfers (Beds)", "Maximum Required Capacity Level"]);
	for (let i = 0; i < N; i++) {
		const nodeName = rawdata.config.node_names[i];
		const maxOverflowValueWithTfr = max_overflows_wtfr[i];
		const maxOverflowValueWithoutTfr = max_overflows_notfr[i];
		const capLevel = max_capacitylevels_wtfr[i];
		const capLevelName = rawdata.config.capacity_names[capLevel];
		addColumn([nodeName, maxOverflowValueWithTfr, maxOverflowValueWithoutTfr, capLevelName]);
	}

	const maxCapLevelName = rawdata.config.capacity_names[d3.max(max_capacitylevels_wtfr)];
	addColumn(["Total", d3.sum(max_overflows_wtfr), d3.sum(max_overflows_notfr), maxCapLevelName]);

	const totalOccupancy = d3.range(T).map(t => d3.sum(rawdata.occupancy, a => a[t]));
	const maxOccupancy = d3.max(totalOccupancy);
	const totalCapacity = d3.range(C).map(c => d3.sum(rawdata.capacity, x => x[c]));
	const idealOverflow = Math.max(0, maxOccupancy - totalCapacity[capacityLevel]);
	const idealCapLevel = totalCapacity.findIndex(c => c > maxOccupancy);
	const idealCapLevelIdx = (idealCapLevel == -1) ? C-1 : Math.max(0, idealCapLevel-1);
	const idealCapLevelName = rawdata.config.capacity_names[idealCapLevelIdx];
	addColumn(["Ideal", idealOverflow, "–", idealCapLevelName]);

	for (const row of rows) {
		tableBody.appendChild(row);
	}
	for (const row of rows) {
		let elem = row.children[0];
		elem.style.fontWeight = "bold";
		elem.style.borderRight = "1px solid lightgray";
	}

	const firstColWidth = 30;
	for (const row of rows) {
		const nCols = row.children.length;
		for (let i = 0; i < nCols; i++) {
			let elem = row.children[i];
			if (i == 0) {
				elem.style.width = `${firstColWidth}%`;
			} else {
				elem.style.width = `${(100-firstColWidth)/nCols}%`;
			}
		}
	}

	if (document.getElementById("surgemetrics-table") == null) {
		const section = getSection("results-metrics");
		section.appendChild(table);
		section.appendChild(document.createElement("hr"));
	} else {
		document.getElementById("surgemetrics-table").replaceWith(table);
	}
}

function createStatsSummary(rawdata, capacityLevel=0) {
	createMetricsCapacitySelect(rawdata);

	const N = rawdata.config.node_names.length;
	const T = rawdata.config.dates.length;
	const nDecimals = 0;

	let table = document.createElement("table");
	table.id = "metrics-table";
	function addMetric(m_name, m_value) {
		let row = document.createElement("tr");
		let col1 = document.createElement("td");
		let col2 = document.createElement("td");

		col1.className = "metric-name-elem";
		col2.className = "metric-value-elem";

		col1.innerText = m_name;
		if (m_value != null && typeof m_value == "number") {
			col2.innerText = m_value.toFixed(nDecimals);
		} else {
			col2.innerText = m_value;
		}

		row.appendChild(col1);
		row.appendChild(col2);
		table.appendChild(row);
	}

	function addMetricSeparator() {
		let lastRow = table.childNodes[table.childElementCount-1];
		for (const elem of lastRow.childNodes) {
			elem.style.borderBottom = "1px solid lightgray";
		}
	}

	const overflow_byloc = d3.range(N).map(i => rawdata.occupancy[i].map(x => Math.max(0, x - rawdata.capacity[i][capacityLevel])));
	const overflow_notfr_byloc = d3.range(N).map(i => rawdata.occupancy_notfr[i].map(x => Math.max(0, x - rawdata.capacity[i][capacityLevel])));

	const overflow_notfr = d3.sum(d3.merge(overflow_notfr_byloc));
	const overflow_wtfr = d3.sum(d3.merge(overflow_byloc));
	const overflow_reduction = (overflow_notfr - overflow_wtfr) / overflow_notfr;
	const overflow_reduction_str = (overflow_notfr != 0) ? (overflow_reduction * 100).toFixed(2) + "%" : "–";

	const maxoverflow_notfr = d3.sum(d3.range(N).map(i => d3.max(overflow_notfr_byloc[i])));
	const maxoverflow_wtfr = d3.sum(d3.range(N).map(i => d3.max(overflow_byloc[i])));;

	const transfers_total = d3.sum(rawdata.transfers, x => d3.sum(x, z => d3.sum(z)));
	const transfers_pct = transfers_total / rawdata.total_patients;

	addMetric("Required Surge Capacity (Without Transfers)", overflow_notfr);
	addMetric("Required Surge Capacity (With Transfers)", overflow_wtfr);
	addMetric("Reduction in Required Surge Capacity", overflow_reduction_str);
	addMetricSeparator();
	addMetric("Max Required Surge Capacity (Without Transfers)", maxoverflow_notfr);
	addMetric("Max Required Surge Capacity (With Transfers)", maxoverflow_wtfr);
	addMetricSeparator();
	addMetric("Transferred Patients", transfers_total);
	addMetric("Perecent of Patients Transferred", (transfers_pct * 100).toFixed(2) + "%");

	if (document.getElementById("metrics-table") == null) {
		const section = getSection("results-metrics");

		if (add_description) {
			let description = document.createElement("p");
			description.innerHTML = metricsDescription;
			section.appendChild(description);
		}

		section.appendChild(table);

		section.appendChild(document.createElement("hr"));
	} else {
		document.getElementById("metrics-table").replaceWith(table);
	}
}

function createMetricsCapacitySelect(rawdata) {
	if (document.getElementById("metrics-capacitylevel-select")) {return;}

	const capacityNames = rawdata.config.capacity_names;
	const options = capacityNames.map((c,i) => ({text: c, value: i}));

	const selectContainer = createSelect(options, {label: "Capacity Level:", id: "metrics-capacitylevel-select"});
	let capacitySelect = selectContainer.querySelector("select");

	capacitySelect.addEventListener("change", () => {
		createStatsSummary(rawdata, capacitySelect.value);
		createSurgeCapacityMetrics(rawdata, capacitySelect.value);
	});

	const section = getSection("results-metrics");
	section.appendChild(selectContainer);
}

function createAdmissionTargetsTable(response, includeCurrent=true) {
	const sectionName = "section-results-metrics";

	let title = document.createElement("p");
	title.innerText = "Admission Targets:";
	title.style.fontWeight = "bold";
	document.getElementById(sectionName).appendChild(title);

	let table = createAdmissionTargetsTableRaw(response, sectionName, includeCurrent);
	table.style.marginLeft = "auto";
	table.style.marginRight = "auto";
}

function createAdmissionTargetsTableRaw(response, sectionName, includeCurrent=true) {
	const tableData = response.admission_targets.table;

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

	for (const capacity_level of tableData.capacity_level) {
		let th = document.createElement("th");
		th.textContent = capacity_level;
		tableHeaderRow.appendChild(th);
	}

	if (includeCurrent) {
		let elem = document.createElement("th");
		elem.textContent = "Average";
		tableHeaderRow.appendChild(elem);
	}

	response.config.node_names.forEach((h,i) => {
		let row = document.createElement("tr");
		tableBody.appendChild(row);

		let nameEntry = document.createElement("th");
		nameEntry.textContent = h;
		row.appendChild(nameEntry);

		const currentLevel = +response.admission_targets.current_admissions[i].toFixed(1);

		for (const v of tableData[h]) {
			let td = document.createElement("td");
			td.textContent = (v == -1) ? 0 : +v.toFixed(1);
			if (includeCurrent) {
				td.style.color = (v < currentLevel) ? "red" : "green";
			}
			row.appendChild(td);
		}

		if (includeCurrent) {
			let elem = document.createElement("td");
			elem.textContent = currentLevel;
			elem.style.fontWeight = "bold";
			row.appendChild(elem);
		}
	});

	return table;
}
