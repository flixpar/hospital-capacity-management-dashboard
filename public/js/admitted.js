const admissionsMargin = {left: 45, right: 5, top: 5, bottom: 20};

const admissionsContainerWidth = 600;
const admissionsSize = {"width": admissionsContainerWidth, "height": 0.4*admissionsContainerWidth};

const admissionsAxisFont = "monospace";
const admissionsDefaultFont = "Helvetica";

const admissionsAxisFontSize = 8;
const admissionsTitleFontSize = 10;

const admissionsLineWidth = 1.25;
const axisColor = "#4a4a4a";

// Dynamic hospital colors - will be loaded from metadata
let admissionsLineColors = null;

import {admissionsDescription} from "./figure_text.js";
export {createAdmissionsPlot};


function createAdmissionsPlot(response, add_description=true) {
	const section = document.getElementById("section-results-admdis");
	if (add_description) {
		let description = document.createElement("p");
		description.innerHTML = admissionsDescription;
		section.appendChild(description);
	}

	const fig = makeAdmissionsPlot(response);
	section.appendChild(fig);

	fig.setAttribute("figure-name", "admissions");
	fig.classList.add("figure");

	// section.appendChild(document.createElement("hr"));
}

function makeAdmissionsPlot(response) {
	const svg = d3.create("svg").attr("viewBox", [0, 0, admissionsSize.width, admissionsSize.height]);

	const N = response.beds.length;
	const T = response.config.dates.length;

	const plotSize = {width: (admissionsSize.width - admissionsMargin.left - admissionsMargin.right) / N, height: admissionsSize.height};
	const plotMargin = {left: 5, right: 5, top: 12, bottom: 40};

	const data = computeAdmissionsData(response);

	const maxAdmissions = d3.max(data.admissions, x => d3.max(x, y => y.value));
	const maxAdmissionsNoTfr = d3.max(data.admissions_notfr, x => d3.max(x, y => y.value));
	const maxY = d3.max([maxAdmissions, maxAdmissionsNoTfr]);

	const xScale = d3.scaleUtc()
		.domain(d3.extent(response.config.dates, d => new Date(Date.parse(d))))
		.range([plotMargin.left, plotSize.width - plotMargin.right]);
	const yScale = d3.scaleLinear()
		.domain([0, maxY]).nice()
		.range([plotSize.height - plotMargin.bottom, plotMargin.top]);

	let g1 = svg.append("g").attr("transform", `translate(0, ${admissionsMargin.top})`);
	const marginSize = {width: admissionsMargin.left, height: plotSize.height};
	g1 = makeYAxisAdmissions(g1, xScale, yScale, marginSize, plotMargin);

	const ind = d3.range(N).sort((i,j) => {
		if (response.config.node_names[i] == "BCC") {
			return 1;
		}
		return (response.config.node_names[i] <= response.config.node_names[j]) ? -1 : 1;
	});
	let tooltips = [];
	for (let i = 0; i < N; i++) {
		const j = ind[i];
		let g = svg.append("g").attr("transform", `translate(${admissionsMargin.left + (i*plotSize.width)}, ${admissionsMargin.top})`);
		tooltips[i] = plotAdmissions(g, xScale, yScale, data, response, j, plotSize, plotMargin);
	}
	for (let i = 0; i < N; i++) {
		let g = svg.append("g").attr("transform", `translate(${admissionsMargin.left + (i*plotSize.width)}, ${admissionsMargin.top})`);
		g.append(() => tooltips[i].node);
	}

	return svg.node();
}

function plotAdmissions(svg, xScale, yScale, data, response, locIdx, plotSize, plotMargin) {

	const xAxis = g => g
		.attr("transform", `translate(0,${plotSize.height - plotMargin.bottom})`)
		.style("font-family", admissionsAxisFont)
		.style("font-size", admissionsAxisFontSize)
		.call(d3.axisBottom(xScale)
			.ticks(d3.timeWeek.every(3))
			.tickSizeOuter(4)
			.tickFormat(d3.timeFormat("%m/%d"))
		)
		.call(g => g.select(".domain").remove())
		.call(g => g.selectAll(".tick line")
			.attr("stroke", axisColor)
			.attr("stroke-width", 0.5)
			.attr("stroke-opacity", 0.75)
		)
		.call(g => g.selectAll(".tick text")
			.attr("fill", axisColor)
			.attr("dy", 2)
			.attr("dx", 10)
			.attr("transform", "rotate(45)")
			.attr("text-anchor", "start")
		);

	const yAxis = g => g
		.attr("transform", `translate(${plotMargin.left},0)`)
		.call(d3.axisRight(yScale)
			.ticks(4)
			.tickSize(plotSize.width - plotMargin.left - plotMargin.right)
			.tickFormat("")
		)
		.call(g => g.select(".domain").remove())
		.call(g => g.selectAll(".tick line")
			.attr("stroke", axisColor)
			.attr("stroke-width", 0.5)
			.attr("stroke-opacity", 0.5)
			.attr("stroke-dasharray", "4,4")
		)
		.call(g => g.selectAll(".tick text")
			.attr("fill", axisColor)
		);

	svg.append("g")
		.call(xAxis);
	svg.append("g")
		.call(yAxis);

	svg.append("text")
		.attr("x", plotSize.width/2)
		.attr("y", 5)
		.attr("text-anchor", "middle")
		.style("font-family", admissionsDefaultFont)
		.style("font-size", admissionsTitleFontSize+"px")
		.text(response.config.node_names[locIdx]);

	const line = d3.line()
		.defined(d => !isNaN(d.value))
		.x(d => xScale(d.date))
		.y(d => yScale(d.value));

	const locName = response.config.node_names[locIdx];
	// Use local colors if available, otherwise use global colors
	const colors = admissionsLineColors || window.hospitalColors || {};
	const locColor = (locName in colors) ? colors[locName] : "#000000";

	svg.append("path")
		.datum(data["admissions"][locIdx])
		.attr("fill", "none")
		.attr("stroke", locColor)
		.attr("stroke-width", admissionsLineWidth)
		.attr("stroke-linejoin", "round")
		.attr("stroke-linecap", "round")
		.attr("d", line);

	svg.append("path")
		.datum(data["admissions_notfr"][locIdx])
		.attr("fill", "none")
		.attr("stroke", locColor)
		.attr("stroke-width", admissionsLineWidth/1.5)
		.attr("stroke-linejoin", "round")
		.attr("stroke-linecap", "round")
		.attr("opacity", 0.25)
		.attr("d", line);

	const tooltip = new AdmissionsTooltip(xScale,yScale);

	const locIdxAlt = response.config.node_names.slice(0).sort().indexOf(response.config.node_names[locIdx]);
	const xOffset = admissionsMargin.left + (locIdxAlt * plotSize.width);
	const yOffset = admissionsMargin.top;

	svg.append("rect")
		.attr("x", plotMargin.left)
		.attr("y", plotMargin.top)
		.attr("width", plotSize.width - plotMargin.left - plotMargin.right)
		.attr("height", plotSize.height - plotMargin.top - plotMargin.bottom)
		.attr("fill", "none")
		.attr("id", `box-${locIdx}`)
		.attr("pointer-events", "visible");

	const lines = [
		data["admissions_notfr"][locIdx],
		data["admissions"][locIdx],
	];

	let parentSVG = svg.node().parentElement;
	svg.selectAll(`#box-${locIdx}`).on("mousemove", event => {
		const svgWidth = parentSVG.clientWidth;
		const scaleFactor = admissionsSize.width / svgWidth;
		const pointerX = ((event.offsetX * scaleFactor) - xOffset);
		const pointerY = ((event.offsetY * scaleFactor) - yOffset);
		if (pointerX < 0 || pointerX > plotSize.width || pointerY < 0 || pointerY > plotSize.height) {
			return;
		}
		const d = admissionsBisect(lines, xScale.invert(pointerX), yScale.invert(pointerY));
		tooltip.show(d);
	});
	svg.select(`#box-${locIdx}`).on("mouseleave", () => tooltip.hide());

	return svg, tooltip;
}

function makeYAxisAdmissions(svg, xScale, yScale, plotSize, plotMargin) {
	const yAxis = g => g
	.attr("transform", `translate(35,0)`)
	.style("font-family", admissionsAxisFont)
	.style("font-size", admissionsAxisFontSize)
	.call(d3.axisRight(yScale)
		.ticks(4)
		.tickSize(6)
	)
	.call(g => g.selectAll(".domain")
		.attr("stroke", axisColor)
		.attr("stroke-width", 0.5)
		.attr("stroke-opacity", 0.75)
	)
	.call(g => g.selectAll(".tick line")
		.attr("stroke", axisColor)
		.attr("stroke-width", 0.5)
		.attr("stroke-opacity", 0.75)
	)
	.call(g => g.selectAll(".tick text")
		.attr("fill", axisColor)
		.attr("x", -20)
		.attr("dy", 2)
		.attr("text-anchor", "start")
	);

	svg.append("g")
		.call(yAxis);

	svg.append("text")
		.attr("transform", `translate(8,${admissionsSize.height/2 + 50}) rotate(-90)`)
		.attr("font-family", admissionsDefaultFont)
		.attr("font-size", 10)
		.text("COVID Patient Admissions");

	return svg;
}

function computeAdmissionsData(response) {
	const N = response.beds.length;
	const T = response.config.dates.length;

	const nodeInds = d3.range(N);

	let admissions_data = [];
	let admissions_notfr_data = [];
	for (let i = 0; i < N; i++) {
		admissions_data[i] = [];
		admissions_notfr_data[i] = [];

		for (let t = 0; t < T; t++) {
			const d = new Date(Date.parse(response.config.dates[t]));
			admissions_data[i][t] = {
				"date": d,
				"value": response.admissions[i][t],
				"data_type": "With Transfers",
				"node_name": response.config.node_names[i],
			};
			admissions_notfr_data[i][t] = {
				"date": d,
				"value": response.arrivals[i][t],
				"data_type": "Without Transfers",
				"node_name": response.config.node_names[i],
			};
		}
	}
	const data = {
		"admissions": admissions_data,
		"admissions_notfr": admissions_notfr_data,
	};

	return data;
}

class AdmissionsTooltip {
	constructor(x,y) {
		this.x = x;
		this.y = y;

		let tmpSVG = d3.create("svg");
		let tmpNode = tmpSVG.append("g")
			.attr("pointer-events", "none")
			.attr("display", "none")
			.attr("font-family", admissionsAxisFont)
			.attr("font-size", admissionsAxisFontSize)
			.attr("text-anchor", "middle");

		tmpNode.append("rect")
			.attr("x", -50)
			.attr("y", -65)
			.attr("width", 100)
			.attr("height", 45)
			.attr("fill", "white")
			.attr("stroke", "gray")
			.attr("stroke-width", 1.5);
		tmpNode.append("rect")
			.attr("transform", "translate(0, -30) rotate(45)")
			.attr("width", 12)
			.attr("height", 12)
			.attr("fill", "white")
			.attr("stroke", "gray")
			.attr("stroke-width", 1.0);
		tmpNode.append("rect")
			.attr("x", -50)
			.attr("y", -65)
			.attr("width", 100)
			.attr("height", 45)
			.attr("fill", "white");

		this.hospNameElem = tmpNode.append("text").attr("y", "-55").node();
		this.tfrElem      = tmpNode.append("text").attr("y", "-45").node();
		this.dateElem     = tmpNode.append("text").attr("y", "-35").node();
		this.yvalElem     = tmpNode.append("text").attr("y", "-25").node();

		tmpNode.append("circle")
			.attr("stroke", "black")
			.attr("fill", "none")
			.attr("r", 2);

		this.node = tmpNode.node();
	}

	show(d) {
		this.node.removeAttribute("display");
		this.node.setAttribute("transform", `translate(${this.x(d.date)},${this.y(d.value)})`);
		this.hospNameElem.textContent = d.node_name;
		this.tfrElem.textContent = d.data_type;
		this.dateElem.textContent = d3.timeFormat("%Y-%m-%d")(d.date);
		this.yvalElem.textContent = "Admissions: " + d.value.toFixed(0);
	}

	hide() {
		this.node.setAttribute("display", "none");
	}
}

const admissionsBisectDate = d3.bisector(d => d.date).center;

function admissionsBisect(lines, date, yval) {
	const line1 = lines[0];
	const i = admissionsBisectDate(line1, date, 1);
	const d = line1[i].date;
	const v = lines.map(l => l.findIndex(x => x.date == d));
	const j = d3.minIndex(v.map((x,k) => Math.abs(lines[k][x].value - yval)));
	return lines[j][v[j]];
}
