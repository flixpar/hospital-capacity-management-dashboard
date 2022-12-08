const loadPlotsWidth = 1000;
const loadPlotsHeight = 500;
const loadPlotsMargin = ({top: 35, right: 30, bottom: 30, left: 60})
const loadPlotsFont = "Helvetica";
const loadPlotsLegendFont = "Monospace";
const loadPlotsShowPoints = false;

import {getDateIntervals, getSection, createSelect} from "./common.js";
import {loadplotsDescription, overallloadplotDescription} from "./figure_text.js";

export {createOverallLoadPlot, createLoadPlots};


function createOverallLoadPlot(rawdata, add_description=true) {
	const section = getSection("results-totalload");

	let overallLoadPlotContainer = document.createElement("div");
	overallLoadPlotContainer.style.width = "75%";
	overallLoadPlotContainer.style.marginLeft = "12.5%";
	section.appendChild(overallLoadPlotContainer);

	const plotTitle = `Total COVID Occupancy in ${rawdata.config.region.region_name}`;

	const overallData = extractOverallLoadData(rawdata, 0);
	const overallLoadPlot = makeOverallLoadPlot(overallData, plotTitle);
	overallLoadPlot.id = "overallloadplot";
	overallLoadPlotContainer.appendChild(overallLoadPlot);

	createCapacityOption("overallloadplot", rawdata);

	if (add_description) {
		let description = document.createElement("p");
		description.className = "caption";
		description.innerHTML = overallloadplotDescription(rawdata);
		section.appendChild(description);
	}
}

function createLoadPlots(rawdata, add_description=true) {
	const section = getSection("results-load");

	const plotTitle = `COVID Occupancy by Hospital in ${rawdata.config.region.region_name}`;
	const loadPlots = makeLoadPlots(rawdata, 0, plotTitle);
	loadPlots.id = "loadplots";
	section.appendChild(loadPlots);

	createCapacityOption("loadplots", rawdata);

	if (add_description) {
		let description = document.createElement("p");
		description.className = "caption";
		description.innerHTML = loadplotsDescription(rawdata);
		section.appendChild(description);
	}
}

function makeLoadPlots(rawdata, capacityLevel=0, plotTitle="COVID Occupancy by Hospital") {
	const loadData = extractLoadData(rawdata, capacityLevel);

	const betweenMargin = 100;
	const labelsWidth = 45;
	const titleHeight = 40;

	const totalTransfers = d3.sum(rawdata.transfers, x => d3.sum(x, y => d3.sum(y)));
	const showTransfers = totalTransfers > 0.1;

	let totalWidth = 2*loadPlotsWidth + loadPlotsMargin.left + loadPlotsMargin.right + betweenMargin + labelsWidth;
	const totalHeight = loadPlotsHeight + loadPlotsMargin.top + loadPlotsMargin.bottom + titleHeight;
	let legendHeight;

	if (!showTransfers) {
		totalWidth = loadPlotsWidth + loadPlotsMargin.left + loadPlotsMargin.right + labelsWidth;
	}

	let svg = d3.create("svg").attr("viewBox", [0, 0, totalWidth, totalHeight]);

	let g1 = svg.append("g").attr("transform", `translate(${loadPlotsMargin.left}, ${loadPlotsMargin.top + titleHeight})`);
	let g2 = svg.append("g").attr("transform", `translate(${loadPlotsMargin.left + betweenMargin + loadPlotsWidth}, ${loadPlotsMargin.top + titleHeight})`);
	let g3 = svg.append("g").attr("transform", `translate(0, ${loadPlotsHeight + loadPlotsMargin.top + loadPlotsMargin.bottom + titleHeight})`);
	let g4 = svg.append("g").attr("transform", `translate(${totalWidth - loadPlotsMargin.right - labelsWidth}, ${loadPlotsMargin.top + titleHeight})`);

	const maxLoadVal = d3.max(loadData.load_notfr, x => d3.max(x, y => y.value))
	const maxY = Math.min(5.0, Math.max(2.0, Math.ceil(maxLoadVal)));

	const yScale = d3.scaleLinear()
		.domain([0, maxY]).nice()
		.range([loadPlotsHeight, 0]);

	g1 = makeLoadPlot(g1, loadData.load_notfr, yScale, maxY, "Without Optimal Transfers");
	g2 = showTransfers ? makeLoadPlot(g2, loadData.load, yScale, maxY, "With Optimal Transfers") : g2;
	g3, legendHeight = makeLoadPlotsLegend(g3, rawdata.config.node_names, totalWidth);
	g4 = makeLoadLabels(g4, yScale, maxY);

	svg.append("text")
		.attr("x", totalWidth / 2)
		.attr("y", 28)
		.attr("text-anchor", "middle")
		.style("font-family", loadPlotsFont)
		.style("font-size", "30px")
		.text(plotTitle);

	makeYLabel(svg, "Occupancy");

	let viewBox = svg.attr("viewBox").split(",").map(z => parseFloat(z));
	viewBox[3] += legendHeight;
	svg.attr("viewBox", viewBox);

	svg.attr("figure-name", "load-hospitals");
	svg.node().classList.add("figure");

	return svg.node();
}

function makeLoadPlot(svg, load, yScale, maxY, title="COVID Patient Load by Location") {

	const yAxis = svg => svg
		.attr("transform", `translate(0,0)`)
		.style("font-family", loadPlotsFont)
		.style("font-size", "20px")
		.call(d3.axisRight(yScale)
			.ticks(5)
			.tickSize(loadPlotsWidth)
		)
		.call(g => g.select(".domain").remove())
		.call(g => g.selectAll(".tick line")
			.attr("stroke-opacity", 0.5)
			.attr("stroke-dasharray", "4,4")
			.attr("stroke", "#4a4a4a"))
		.call(g => g.selectAll(".tick text")
			.attr("x", "-10px")
			.attr("dy", "4px")
			.attr("text-anchor", "end")
			.attr("fill", "#4a4a4a")
			.text(t => (t*100) + "%")
		);

	const dates = load[0].map(d => d.date);
	const xInterval = getDateIntervals(dates);
	const N = load.length;

	const x = d3.scaleUtc()
		.domain(d3.extent(dates))
		.range([0, loadPlotsWidth]);

	const xAxis = g => g
		.attr("transform", `translate(0,${loadPlotsHeight})`)
		.style("font-family", loadPlotsFont)
		.style("font-size", "20px")
		.call(d3.axisBottom(x)
			.ticks(xInterval)
			.tickSize(-loadPlotsHeight)
			.tickFormat(d3.timeFormat("%m/%d/%y"))
		)
		.call(g => g.select(".domain").remove())
		.call(g => g.selectAll(".tick line")
			.attr("stroke-opacity", 0.5)
			.attr("stroke-dasharray", "4,4")
			.attr("stroke", "#4a4a4a"))
		.call(g => g.selectAll(".tick text").attr("dy", "20px").attr("fill", "#4a4a4a"));

	const colorscale = d3.scaleSequential(d3.interpolateRainbow).domain([0,N]);

	const line = d3.line()
		.defined(d => !isNaN(d.value))
		.x(d => x(d.date))
		.y(d => yScale(d.value))

	svg.append("g").call(xAxis);
	svg.append("g").call(yAxis);

	svg.append("rect")
		.attr("x", 0)
		.attr("y", yScale(1.0))
		.attr("width", loadPlotsWidth)
		.attr("height", yScale(0.0)-yScale(1.0))
		.attr("stroke", "none")
		.attr("fill", "green")
		.attr("opacity", 0.2);

	svg.append("rect")
		.attr("x", 0)
		.attr("y", yScale(maxY))
		.attr("width", loadPlotsWidth)
		.attr("height", yScale(1.0)-yScale(maxY))
		.attr("stroke", "none")
		.attr("fill", "red")
		.attr("opacity", 0.2);

	svg.append("line")
		.attr("x1", 0)
		.attr("x2", loadPlotsWidth)
		.attr("y1", yScale(1.0))
		.attr("y2", yScale(1.0))
		.attr("stroke-width", 6)
		.attr("stroke", "red");

	for (let i = 0; i < N; i++) {

		svg.append("path")
			.datum(load[i])
			.attr("fill", "none")
			.attr("stroke", colorscale(i))
			.attr("stroke-width", 2)
			.attr("d", line);

		if (loadPlotsShowPoints) {
			svg.selectAll("points")
				.data(load[i])
				.enter().append("circle")
				.attr("fill", colorscale(i))
				.attr("cx", d => x(d.date))
				.attr("cy", d => yScale(d.value))
				.attr("r", 5);
		}

	}

	svg.append("rect")
		.attr("x", 0)
		.attr("y", -loadPlotsMargin.top)
		.attr("width", loadPlotsWidth)
		.attr("height", loadPlotsMargin.top)
		.attr("stroke", "none")
		.attr("fill", "white")
		.attr("opacity", 1.0);

	svg.append("text")
		.attr("x", loadPlotsWidth/2)
		.attr("y", -10)
		.attr("text-anchor", "middle")
		.style("font-family", loadPlotsFont)
		.style("font-size", "26px")
		.attr("fill", "black")
		.text(title);

	return svg;
}

function makeOverallLoadPlot(overall_load, plotTitle="Total COVID Occupancy") {
	const labelsWidth = 45;
	const svg = d3.create("svg").attr("viewBox", [0, 0, loadPlotsWidth+labelsWidth, loadPlotsHeight]);

	svg.append("text")
		.attr("x", loadPlotsWidth/2)
		.attr("y", 25)
		.attr("text-anchor", "middle")
		.style("font-family", loadPlotsFont)
		.style("font-size", "22px")
		.text(plotTitle);

	const maxLoadVal = d3.max(overall_load, y => y.value)
	const maxY = Math.min(5.0, Math.max(2.0, Math.ceil(maxLoadVal)));
	// const maxY = 3.0;

	const y = d3.scaleLinear()
		.domain([0, maxY]).nice()
		.range([loadPlotsHeight - loadPlotsMargin.bottom, loadPlotsMargin.top])

	const yAxis = svg => svg
		.attr("transform", `translate(${loadPlotsMargin.left},0)`)
		.style("font-family", loadPlotsFont)
		.style("font-size", "15px")
		.call(d3.axisRight(y)
			.ticks(5)
			.tickSize(loadPlotsWidth - loadPlotsMargin.left - loadPlotsMargin.right)
		)
		.call(g => g.select(".domain").remove())
		.call(g => g.selectAll(".tick line")
			.attr("stroke-opacity", 0.5)
			.attr("stroke-dasharray", "4,4")
			.attr("stroke", "#4a4a4a"))
		.call(g => g.selectAll(".tick text")
			.attr("x", "-10px")
			.attr("dy", "4px")
			.attr("text-anchor", "end")
			.attr("fill", "#4a4a4a")
			.text(t => (t*100) + "%")
		);

	const dates = overall_load.map(d => d.date);
	const xInterval = getDateIntervals(dates);

	const x = d3.scaleUtc()
		.domain(d3.extent(dates))
		.range([loadPlotsMargin.left, loadPlotsWidth - loadPlotsMargin.right]);

	const xAxis = g => g
		.attr("transform", `translate(0,${loadPlotsHeight - loadPlotsMargin.bottom})`)
		.style("font-family", loadPlotsFont)
		.style("font-size", "15px")
		.call(d3.axisBottom(x)
			.ticks(xInterval)
			.tickSize(-(loadPlotsHeight - loadPlotsMargin.top - loadPlotsMargin.bottom))
			.tickFormat(d3.timeFormat("%m/%d/%y"))
		)
		.call(g => g.select(".domain").remove())
		.call(g => g.selectAll(".tick line")
			.attr("stroke-opacity", 0.5)
			.attr("stroke-dasharray", "4,4")
			.attr("stroke", "#4a4a4a"))
		.call(g => g.selectAll(".tick text").attr("dy", "20px").attr("fill", "#4a4a4a"));

	const line = d3.line()
		.defined(d => !isNaN(d.value))
		.x(d => x(d.date))
		.y(d => y(d.value));

	svg.append("g")
		.call(xAxis);

	svg.append("g")
		.call(yAxis);

	svg.append("rect")
		.attr("x", loadPlotsMargin.left)
		.attr("y", y(1.0))
		.attr("width", loadPlotsWidth-loadPlotsMargin.right-loadPlotsMargin.left)
		.attr("height", y(0.0)-y(1.0))
		.attr("stroke", "none")
		.attr("fill", "green")
		.attr("opacity", 0.2);

	svg.append("rect")
		.attr("x", loadPlotsMargin.left)
		.attr("y", y(maxY))
		.attr("width", loadPlotsWidth-loadPlotsMargin.right-loadPlotsMargin.left)
		.attr("height", y(1.0)-y(maxY))
		.attr("stroke", "none")
		.attr("fill", "red")
		.attr("opacity", 0.2);

	svg.append("line")
		.attr("x1", loadPlotsMargin.left)
		.attr("x2", loadPlotsWidth-loadPlotsMargin.right)
		.attr("y1", y(1.0))
		.attr("y2", y(1.0))
		.attr("stroke-width", 5)
		.attr("stroke", "red");

	svg.append("path")
		.datum(overall_load)
		.attr("fill", "none")
		.attr("stroke", "darkblue")
		.attr("stroke-width", 2)
		.attr("stroke-linejoin", "round")
		.attr("stroke-linecap", "round")
		.attr("d", line);

	if (loadPlotsShowPoints) {
		svg.selectAll("points")
			.data(overall_load)
			.enter().append("circle")
			.attr("fill", "darkblue")
			.attr("stroke", "white")
			.attr("stroke-width", 0.5)
			.attr("cx", d => x(d.date))
			.attr("cy", d => y(d.value))
			.attr("r", 4);
	}

	let sideLabelsArea = svg.append("g").attr("transform", `translate(${loadPlotsWidth-25}, 0)`);
	sideLabelsArea = makeLoadLabels(sideLabelsArea, y, maxY);

	makeYLabel(svg, "Occupancy");

	svg.attr("figure-name", "load-overall");
	svg.node().classList.add("figure");

	return svg.node();
}

function makeYLabel(svg, text) {
	let viewBox = svg.attr("viewBox").split(",").map(z => parseFloat(z));
	const svgHeight = viewBox[3];
	svg.append("text")
		.attr("text-anchor", "middle")
		.attr("transform", `translate(${viewBox[0]-16},${svgHeight/2}) rotate(-90)`)
		.style("font-family", loadPlotsFont)
		.style("font-size", "18px")
		.text(text);
	viewBox[0] = viewBox[0] - 36;
	viewBox[2] = viewBox[2] + 36;
	svg.attr("viewBox", viewBox);
	return svg;
}

function makeLoadPlotsLegend(svg, location_names, totalWidth) {
	const N = location_names.length;

	const maxNameLength = d3.max(location_names, x => x.length);
	const rowHeight = 20;
	const colWidth = (maxNameLength * 16) + 10 + 10 + 25;

	const maxCols = Math.floor(totalWidth / colWidth);
	const nRows = Math.ceil(N / maxCols);
	const nCols = Math.min(maxCols, N);

	const actualWidth = colWidth * nCols;
	const marginLeft  = (totalWidth - actualWidth) / 2;
	const marginTop   = 10;

	const totalHeight = (nRows * rowHeight) + marginTop + 5;

	const debug = false;

	const colorscale = d3.scaleSequential(d3.interpolateRainbow).domain([0,N]);

	for (let i = 0; i < nRows; i++) {
		for (let j = 0; j < nCols; j++) {
			const k = (i*nCols) + j;
			if (k >= N) continue;

			svg.append("rect")
				.attr("x", marginLeft + ( colWidth * j))
				.attr("y", marginTop  + (rowHeight * i))
				.attr("width", 20)
				.attr("height", 20)
				.attr("rx", 3)
				.attr("ry", 3)
				.attr("fill", colorscale(k))
				.attr("stroke", "none");

			svg.append("text")
				.attr("x", marginLeft + 24 + ( colWidth * j))
				.attr("y", marginTop  + 16 + (rowHeight * i))
				.attr("text-anchor", "start")
				.style("font-family", loadPlotsLegendFont)
				.style("font-size", "20px")
				.attr("fill", "black")
				.text(location_names[k]);

			if (debug) {
				svg.append("rect")
					.attr("x", marginLeft + ( colWidth * j))
					.attr("y", marginTop  + (rowHeight * i))
					.attr("width", colWidth)
					.attr("height", 10)
					.attr("fill", "none")
					.attr("stroke", "gray");
			}
		}
	}

	if (debug) {
		svg.append("rect")
			.attr("x", marginLeft)
			.attr("y", marginTop)
			.attr("width", nCols * colWidth)
			.attr("height", 10)
			.attr("fill", "none")
			.attr("stroke", "black");
	}

	return svg, totalHeight;
}

function makeLoadLabels(svg, yScale, maxY) {

	const gap = 0.15;

	svg.append("line")
		.attr("x1", 20)
		.attr("x2", 20)
		.attr("y1", yScale(0))
		.attr("y2", yScale(1 - gap/2))
		.attr("stroke", "green")
		.attr("stroke-width", 2);

	svg.append("line")
		.attr("x1", 20)
		.attr("x2", 20)
		.attr("y1", yScale(1 + gap/2))
		.attr("y2", yScale(maxY))
		.attr("stroke", "red")
		.attr("stroke-width", 2);

	const q1 = yScale(0.5) - 50;
	svg.append("text")
		.style("text-anchor", "center")
		.attr("transform", `translate(40,${q1}) rotate(90)`)
		.style("fill", "green")
		.style("font-family", loadPlotsFont)
		.text("Within Capacity");

	const q2 = yScale((1 + maxY)/2) - 50;
	svg.append("text")
		.style("text-anchor", "center")
		.attr("transform", `translate(40,${q2}) rotate(90)`)
		.style("fill", "red")
		.style("font-family", loadPlotsFont)
		.text("Over Capacity");

	return svg;
}

function extractLoadData(rawdata, capacityLevel=3) {
	const N = rawdata.capacity.length;
	const T = rawdata.config.dates.length;

	let load_data = [];
	let load_notfr_data = [];

	if (capacityLevel == -1) {
		capacityLevel = rawdata.capacity[0].length - 1;
	}

	for (let i = 0; i < N; i++) {
		load_data[i] = [];
		load_notfr_data[i] = [];

		for (let t = 0; t < T; t++) {
			const d = new Date(Date.parse(rawdata.config.dates[t]));
			if (rawdata.capacity[i][capacityLevel] == 0) {
				continue;
			}
			load_data[i][t] = {
				"date": d,
				"value": rawdata.occupancy[i][t] / rawdata.capacity[i][capacityLevel],
			};
			load_notfr_data[i][t] = {
				"date": d,
				"value": rawdata.occupancy_notfr[i][t] / rawdata.capacity[i][capacityLevel],
			};
		}
	}

	return {
		"load": load_data,
		"load_notfr": load_notfr_data,
	};
}

function extractOverallLoadData(rawdata, capacityLevel=3) {
	const N = rawdata.beds.length;
	const T = rawdata.config.dates.length;

	if (capacityLevel == -1) {
		capacityLevel = rawdata.capacity[0].length - 1;
	}

	let overall_load = [];
	const totBeds = d3.sum(rawdata.capacity, x => x[capacityLevel]);
	const occupancyNoTfrByDay = d3.transpose(rawdata.occupancy_notfr);
	for (let t = 0; t < T; t++) {
		const d = new Date(Date.parse(rawdata.config.dates[t]));
		overall_load[t] = {
			"date": d,
			"value": d3.sum(occupancyNoTfrByDay[t]) / totBeds,
		};
	}

	return overall_load;
}

function createCapacityOption(plotName, rawdata) {

	const capacityNames = rawdata.config.capacity_names;
	const options = capacityNames.map((c,i) => ({text: c, value: i}));

	const selectContainer = createSelect(options, {label: "Capacity Level:", id: `${plotName}-capacitylevel`});
	let capacitySelect = selectContainer.querySelector("select");

	let plotSection = null;
	if (plotName == "overallloadplot") {
		capacitySelect.addEventListener("change", e => {
			e.preventDefault();

			const sel = e.target;
			const capacityLevel = sel.options[sel.selectedIndex].value;

			const overallData = extractOverallLoadData(rawdata, capacityLevel);
			const overallLoadPlot = makeOverallLoadPlot(overallData);

			document.getElementById("overallloadplot").replaceWith(overallLoadPlot);
			overallLoadPlot.id = "overallloadplot";
		});
		plotSection = getSection("results-totalload");
	} else if (plotName == "loadplots") {
		capacitySelect.addEventListener("change", e => {
			e.preventDefault();

			const sel = e.target;
			const capacityLevel = sel.options[sel.selectedIndex].value;

			const loadPlots = makeLoadPlots(rawdata, capacityLevel);

			document.getElementById("loadplots").replaceWith(loadPlots);
			loadPlots.id = "loadplots";
		});
		plotSection = getSection("results-load");
	}

	plotSection.appendChild(selectContainer);
}
