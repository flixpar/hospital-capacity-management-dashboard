const dischargedMargin = {left: 45, right: 5, top: 5, bottom: 5};

const dischargedContainerWidth = 600;
const dischargedSize = {"width": dischargedContainerWidth, "height": 0.4*dischargedContainerWidth};

const dischargedAxisFont = "monospace";
const dischargedDefaultFont = "Helvetica";

const dischargedAxisFontSize = 8;
const dischargedTitleFontSize = 10;

const dischargedLineWidth = 2;
const axisColor = "#4a4a4a";

const dischargedLineColors = {
	"BMC":  "#006C67",
	"HCGH": "#B9314F",
	"JHH":  "#454E9E",
	"SH":   "#95B46A",
	"SMH":  "#B6C2D9",
	"BCC":  "#9370DB",
	"default": "blue",
};

import {dischargedDescription} from "./figure_text.js";
export {createDischargedPlot};


function createDischargedPlot(response, add_description=true) {
	const section = document.getElementById("section-results-admdis");
	if (add_description) {
		let description = document.createElement("p");
		description.innerHTML = dischargedDescription;
		section.appendChild(description);
	}

	const fig = makeDischargedPlot(response);
	section.appendChild(fig);

	fig.setAttribute("figure-name", "discharges");
	fig.classList.add("figure");
}

function makeDischargedPlot(response) {
	const svg = d3.create("svg").attr("viewBox", [0, 0, dischargedSize.width, dischargedSize.height]);

	const N = response.beds.length;
	const T = response.config.dates.length;

	const plotSize = {width: (dischargedSize.width - dischargedMargin.left - dischargedMargin.right) / N, height: dischargedSize.height};
	const plotMargin = {left: 5, right: 5, top: 12, bottom: 25};

	const data = computeDischargedData(response);

	const maxDischarged = d3.max(data.discharged, x => d3.max(x, y => y.value));
	const maxDischargedNoTfr = d3.max(data.discharged_notfr, x => d3.max(x, y => y.value));
	const maxY = d3.max([maxDischarged, maxDischargedNoTfr]);

	const xScale = d3.scaleUtc()
		.domain(d3.extent(response.config.dates, d => new Date(Date.parse(d))))
		.range([plotMargin.left, plotSize.width - plotMargin.right]);
	const yScale = d3.scaleLinear()
		.domain([0, maxY]).nice()
		.range([plotSize.height - plotMargin.bottom, plotMargin.top]);

	let g1 = svg.append("g").attr("transform", `translate(0, ${dischargedMargin.top})`);
	const marginSize = {width: dischargedMargin.left, height: plotSize.height};
	g1 = makeYAxisDischarged(g1, xScale, yScale, marginSize, plotMargin);

	const ind = d3.range(N).sort((i,j) => {
		if (response.config.node_names[i] == "BCC") {
			return 1;
		}
		return (response.config.node_names[i] <= response.config.node_names[j]) ? -1 : 1;
	});	let tooltips = [];
	for (let i = 0; i < N; i++) {
		const j = ind[i];
		let g = svg.append("g").attr("transform", `translate(${dischargedMargin.left + (i*plotSize.width)}, ${dischargedMargin.top})`);
		g,tooltips[i] = plotDischarged(g, xScale, yScale, data, response, j, plotSize, plotMargin);
	}
	for (let i = 0; i < N; i++) {
		let g = svg.append("g").attr("transform", `translate(${dischargedMargin.left + (i*plotSize.width)}, ${dischargedMargin.top})`);
		g.append(() => tooltips[i].node);
	}

	return svg.node();
}

function plotDischarged(svg, xScale, yScale, data, response, locIdx, plotSize, plotMargin) {

	const xAxis = g => g
		.attr("transform", `translate(0,${plotSize.height - plotMargin.bottom})`)
		.style("font-family", dischargedAxisFont)
		.style("font-size", dischargedAxisFontSize)
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
			.attr("dy", 10)
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
		.style("font-family", dischargedDefaultFont)
		.style("font-size", dischargedTitleFontSize+"px")
		.text(response.config.node_names[locIdx]);

	const line = d3.line()
		.defined(d => !isNaN(d.value))
		.x(d => xScale(d.date))
		.y(d => yScale(d.value));

	const locName = response.config.node_names[locIdx];
	const locColor = (locName in dischargedLineColors) ? dischargedLineColors[locName] : dischargedLineColors["default"];

	svg.append("path")
		.datum(data["discharged"][locIdx])
		.attr("fill", "none")
		.attr("stroke", locColor)
		.attr("stroke-width", dischargedLineWidth)
		.attr("stroke-linejoin", "round")
		.attr("stroke-linecap", "round")
		.attr("d", line);

	svg.append("path")
		.datum(data["discharged_notfr"][locIdx])
		.attr("fill", "none")
		.attr("stroke", locColor)
		.attr("stroke-width", dischargedLineWidth/1.5)
		.attr("stroke-linejoin", "round")
		.attr("stroke-linecap", "round")
		.attr("opacity", 0.25)
		.attr("d", line);

	const tooltip = new DischargedTooltip(xScale,yScale);

	const locIdxAlt = response.config.node_names.slice(0).sort().indexOf(response.config.node_names[locIdx]);
	const xOffset = dischargedMargin.left + (locIdxAlt * plotSize.width);
	const yOffset = dischargedMargin.top;

	svg.append("rect")
		.attr("x", plotMargin.left)
		.attr("y", plotMargin.top)
		.attr("width", plotSize.width - plotMargin.left - plotMargin.right)
		.attr("height", plotSize.height - plotMargin.top - plotMargin.bottom)
		.attr("fill", "none")
		.attr("id", `box-${locIdx}`)
		.attr("pointer-events", "visible");

	const lines = [
		data["discharged_notfr"][locIdx],
		data["discharged"][locIdx],
	];

	let parentSVG = svg.node().parentElement;
	svg.selectAll(`#box-${locIdx}`).on("mousemove", event => {
		const svgWidth = parentSVG.clientWidth;
		const scaleFactor = dischargedSize.width / svgWidth;
		const pointerX = ((event.offsetX * scaleFactor) - xOffset);
		const pointerY = ((event.offsetY * scaleFactor) - yOffset);
		if (pointerX < 0 || pointerX > plotSize.width || pointerY < 0 || pointerY > plotSize.height) {
			return;
		}
		const d = dischargedBisect(lines, xScale.invert(pointerX), yScale.invert(pointerY));
		tooltip.show(d);
	});
	svg.select(`#box-${locIdx}`).on("mouseleave", () => tooltip.hide());

	return svg, tooltip;
}

function makeYAxisDischarged(svg, xScale, yScale, plotSize, plotMargin) {
	const yAxis = g => g
	.attr("transform", `translate(35,0)`)
	.style("font-family", dischargedAxisFont)
	.style("font-size", dischargedAxisFontSize)
	.call(d3.axisRight(yScale)
		.ticks(4)
		.tickSize(6)
	)
	.call(g => g.selectAll(".domain")
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
		.attr("transform", `translate(8,${dischargedSize.height/2 + 50}) rotate(-90)`)
		.attr("font-family", dischargedDefaultFont)
		.attr("font-size", 10)
		.text("COVID Patient Discharges");

	return svg;
}

function computeDischargedData(response) {
	const N = response.beds.length;
	const T = response.config.dates.length;

	const nodeInds = d3.range(N);

	let discharged_data = [];
	let discharged_notfr_data = [];
	for (let i = 0; i < N; i++) {
		discharged_data[i] = [];
		discharged_notfr_data[i] = [];

		for (let t = 0; t < T; t++) {
			const d = new Date(Date.parse(response.config.dates[t]));
			discharged_data[i][t] = {
				"date": d,
				"value": (t == 0) ? 0 : (
					response.occupancy[i][t-1]
					+ response.admissions[i][t]
					- d3.sum(nodeInds.map(j => response.transfers[i][j][t]))
					+ d3.sum(nodeInds.map(j => response.transfers[j][i][t]))
					- response.occupancy[i][t]
				),
				"data_type": "With Transfers",
				"node_name": response.config.node_names[i],
			};
			discharged_notfr_data[i][t] = {
				"date": d,
				"value": (t == 0) ? 0 : (
					response.occupancy_notfr[i][t-1]
					+ response.admissions[i][t]
					- response.occupancy_notfr[i][t]
				),
				"data_type": "Without Transfers",
				"node_name": response.config.node_names[i],
			};
		}
	}
	const data = {
		"discharged": discharged_data,
		"discharged_notfr": discharged_notfr_data,
	};

	return data;
}

class DischargedTooltip {
	constructor(x,y) {
		this.x = x;
		this.y = y;

		let tmpSVG = d3.create("svg");
		let tmpNode = tmpSVG.append("g")
			.attr("pointer-events", "none")
			.attr("display", "none")
			.attr("font-family", dischargedAxisFont)
			.attr("font-size", dischargedAxisFontSize)
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
		this.yvalElem.textContent = "Discharges: " + d.value.toFixed(0);
	}

	hide() {
		this.node.setAttribute("display", "none");
	}
}

const dischargedBisectDate = d3.bisector(d => d.date).center;

function dischargedBisect(lines, date, yval) {
	const line1 = lines[0];
	const i = dischargedBisectDate(line1, date, 1);
	const d = line1[i].date;
	const v = lines.map(l => l.findIndex(x => x.date == d));
	const j = d3.minIndex(v.map((x,k) => Math.abs(lines[k][x].value - yval)));
	return lines[j][v[j]];
}
