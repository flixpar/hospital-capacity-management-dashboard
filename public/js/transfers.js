const tfrFigureSize = {width: 600, height: 400};
const tfrFigureMargin = {left: 35, right: 2, top: 2, bottom: 2};
// Dynamic hospital colors - will be loaded from metadata
let tfrBarColors = null;
const tfrFigureFont = "Helvetica, Arial, sans-serif";

import {makeLegend} from "./common.js";
import {transfersDescription} from "./figure_text.js";

export {createTransfersBreakdownPlot};


function createTransfersBreakdownPlot(response, add_description=true) {
	const totalTransfers = d3.sum(response.transfers, x => d3.sum(x, y => d3.sum(y)));
	if (totalTransfers < 0.1) {return;}

	const section = document.getElementById("section-results-transfers");
	if (add_description) {
		let description = document.createElement("p");
		description.innerHTML = transfersDescription;
		section.appendChild(description);
	}

	const fig = makeTransfersBreakdownPlot(response);
	section.appendChild(fig);

	fig.setAttribute("figure-name", "transfers-breakdown");
	fig.classList.add("figure");

	let hr = document.createElement("hr");
	section.appendChild(hr);
}

function makeTransfersBreakdownPlot(response) {
	let svg = d3.create("svg").attr("viewBox", [0, 0, tfrFigureSize.width, tfrFigureSize.height]);
	const plotMargin = {left: 50, right: 4, top: 5, bottom: 20};

	const N = response.config.node_names.length;

	const innerHeight = tfrFigureSize.height - (tfrFigureMargin.top + tfrFigureMargin.bottom) - N*(plotMargin.top + plotMargin.bottom);
	const innerWidth = tfrFigureSize.width - (tfrFigureMargin.left + tfrFigureMargin.right) - (plotMargin.left + plotMargin.right);
	const plotSize = {width: innerWidth, height: innerHeight / N};

	for (let i = 0; i < N; i++) {
		let g = svg.append("g").attr("transform", `translate(${tfrFigureMargin.left+plotMargin.left}, ${tfrFigureMargin.top + (i * (plotSize.height + plotMargin.top + plotMargin.bottom))})`);
		g = makeTransfersBreakdownSubplot(g, response, i, plotSize);
	}

	let axisG = svg.append("g").attr("transform", `translate(${tfrFigureMargin.left+plotMargin.left}, ${tfrFigureMargin.top + (N * (plotSize.height + plotMargin.top + plotMargin.bottom))})`);
	axisG = makeTransfersBreakdownXAxis(axisG, response, plotSize);

	svg.append("text")
		.attr("transform", `translate(10,${tfrFigureSize.height/2 + 40}) rotate(-90)`)
		.attr("font-family", tfrFigureFont)
		.attr("font-size", 10)
		.text("Origin Hospital");

	const hospNames = response.config.node_names;
	// Use local colors if available, otherwise use global colors
	const colors = tfrBarColors || window.hospitalColors || {};
	const hospColors = response.config.node_names.map(h => (h in colors) ? colors[h] : "#000000");
	makeLegend(svg, hospNames, hospColors);

	return svg.node();
}

function makeTransfersBreakdownSubplot(svg, response, locIdx, plotSize) {
	const N = response.config.node_names.length;
	const T = response.config.dates.length;

	const dates = response.config.dates.map(d => new Date(d));
	const x = d3.scaleUtc()
		.domain(d3.extent(dates))
		.range([0, plotSize.width]);

	const maxY = d3.max(d3.range(N).map(i => d3.range(T).map(t => {
		return d3.sum(response.transfers[i], x => x[t]);
	})).flat());
	const y = d3.scaleLinear()
		.domain([0, maxY]).nice()
		.range([plotSize.height, 0]);

	const xAxis = g => g
	.attr("transform", `translate(0,${plotSize.height})`)
	.style("font-family", tfrFigureFont)
	.style("font-size", "8px")
	.call(d3.axisBottom(x)
		.ticks(d3.utcWeek.every(1))
		.tickSize(-plotSize.height)
		.tickFormat("")
	)
	.call(g => g.select(".domain").remove())
	.call(g => g.selectAll(".tick line")
		.attr("stroke", "#4a4a4a")
		.attr("stroke-width", 0.25)
		.attr("stroke-opacity", 0.5)
		.attr("stroke-dasharray", "4,4")
	)
	.call(g => g.selectAll(".tick text")
		.attr("fill", "#4a4a4a")
	);

	const yAxis = svg => svg
	.attr("transform", `translate(0,0)`)
	.style("font-family", tfrFigureFont)
	.style("font-size", "8px")
	.call(d3.axisRight(y)
		.ticks(4)
		.tickSize(plotSize.width)
	)
	.call(g => g.select(".domain")
		.remove()
	)
	.call(g => g.selectAll(".tick line")
		.attr("stroke", "#4a4a4a")
		.attr("stroke-width", 0.25)
		.attr("stroke-opacity", 0.5)
		.attr("stroke-dasharray", "4,4")
	)
	.call(g => g.selectAll(".tick text")
		.attr("fill", "#4a4a4a")
		.attr("x", "-10px")
		.attr("dy", "4px")
		.attr("text-anchor", "end")
	);

	svg.append("g")
		.call(xAxis);
	svg.append("g")
		.call(yAxis);

	let ylabel = svg.append("text")
		.style("text-anchor", "center")
		.style("font-family", "Helvetica, Arial, sans-serif")
		.style("font-size", "8px")
		.style("text-align", "center")
		.attr("transform", `translate(-30,${y(maxY/2)+20}) rotate(-90)`);
	ylabel.append("tspan")
		.attr("x", 0)
		.attr("dy", 0)
		.text("Outgoing");
	ylabel.append("tspan")
		.attr("x", 0)
		.attr("dy", "1.2em")
		.text("Transfers");

	svg.append("text")
		.style("text-anchor", "center")
		.style("font-family", tfrFigureFont)
		.style("font-size", "9px")
		.attr("transform", `translate(-60,${y(maxY/2)})`)
		.text(response.config.node_names[locIdx]);

	const data = d3.range(T).map(t => {
		let vals = d3.cumsum(response.transfers[locIdx], a => a[t]);
		return {
			date: dates[t],
			values: vals,
		}
	});

	const series = d3.range(N).map(j => {
		return data.map((d,t) => {
			return {
				date: d.date,
				color: (response.config.node_names[j] in (tfrBarColors || window.hospitalColors || {})) ? (tfrBarColors || window.hospitalColors)[response.config.node_names[j]] : "#000000",
				0: (j == 0) ? 0 : d.values[j-1],
				1: d.values[j],
				value: response.transfers[locIdx][j][t],
				fromIdx: locIdx,
				toIdx: j,
			}
		});
	});

	const binWidth = 1.02 * (x(dates[1]) - x(dates[0]));

	const tooltip = new TransfersTooltip(svg, x, y, binWidth, response.config.node_names, plotSize);

	svg.append("g")
		.selectAll("g")
		.data(series)
		.join("g")
		.selectAll("rect")
			.data(d => d)
			.join("rect")
				.attr("x", d => x(d.date))
				.attr("y", d => y(d[1]))
				.attr("height", d => Math.max(0, y(d[0]) - y(d[1])))
				.attr("width", binWidth)
				.attr("fill", d => d.color)
			.on("mouseover", (e,d) => tooltip.show(d, e))
			.on("mouseout", _ => tooltip.hide());

	svg.append(() => tooltip.node);

	return svg;
}

function makeTransfersBreakdownXAxis(svg, response, plotSize) {
	const dates = response.config.dates.map(d => new Date(d));
	const x = d3.scaleUtc()
		.domain(d3.extent(dates))
		.range([0, plotSize.width]);

	const xAxis = g => g
	.style("font-family", tfrFigureFont)
	.style("font-size", "8px")
	.call(d3.axisBottom(x)
		.ticks(d3.utcWeek.every(1))
		.tickSize(0)
		.tickFormat(d3.timeFormat("%m/%d/%y"))
	)
	.call(g => g.select(".domain").remove())
	.call(g => g.selectAll(".tick line")
		.attr("stroke", "#4a4a4a")
	)
	.call(g => g.selectAll(".tick text")
		.attr("fill", "#4a4a4a")
		.attr("dy", -2)
	);

	svg.append("g")
		.call(xAxis);

	return svg;
}

class TransfersTooltip {
	constructor(svg,x,y,binWidth,node_names, plotSize) {
		this.x = x;
		this.y = y;
		this.binWidth = binWidth;
		this.node_names = node_names;
		this.svg = svg;
		this.highlight = null;
		this.plotSize = plotSize;

		let tmpSVG = d3.create("svg");
		let tmpNode = tmpSVG.append("g")
			.attr("pointer-events", "none")
			.attr("display", "none")
			.attr("font-family", "monospace")
			.attr("font-size", "8px")
			.attr("text-anchor", "middle");

		this.box = tmpNode.append("rect")
			.attr("x", -50)
			.attr("width", 100)
			.attr("height", 40)
			.attr("fill", "white")
			.attr("stroke", "gray")
			.attr("stroke-width", 1.5);
		this.pointer = tmpNode.append("rect")
			.attr("width", 15)
			.attr("height", 15)
			.attr("fill", "white")
			.attr("stroke", "gray")
			.attr("stroke-width", 1.0);
		this.cover = tmpNode.append("rect")
			.attr("x", -50)
			.attr("width", 100)
			.attr("height", 40)
			.attr("fill", "white");

		this._locs = tmpNode.append("text").node();
		this._date = tmpNode.append("text").node();
		this._yval = tmpNode.append("text").node();

		this.node = tmpNode.node();
	}

	show(d,e) {
		this.svg.raise();
		this.node.removeAttribute("display");

		let posX = this.x(d.date) + (this.binWidth / 2);
		let posY = this.y(d[1]);

		const tooltipWidth = 100;
		const tooltipHeight = 60; // Approximate height of tooltip box with pointer

		let translateX = posX;
		let translateY = posY;

		// Horizontal bounds check
		if (translateX - tooltipWidth / 2 < 0) {
			translateX = tooltipWidth / 2;
		}
		if (translateX + tooltipWidth / 2 > this.plotSize.width) {
			translateX = this.plotSize.width - tooltipWidth / 2;
		}

		// Vertical bounds check
		if (posY < tooltipHeight) {
			// Not enough space above, show below the bar
			this.box.attr("y", 10);
			this.pointer.attr("transform", "translate(0, 25) rotate(45)");
			this.cover.attr("y", 10);
			d3.select(this._locs).attr("y", 23);
			d3.select(this._date).attr("y", 33);
			d3.select(this._yval).attr("y", 43);
			translateY = this.y(d[0]);
		} else {
			// Show above the bar (default)
			this.box.attr("y", -50);
			this.pointer.attr("transform", "translate(0, -25) rotate(45)");
			this.cover.attr("y", -50);
			d3.select(this._locs).attr("y", -37);
			d3.select(this._date).attr("y", -27);
			d3.select(this._yval).attr("y", -17);
			translateY = posY;
		}


		this.node.setAttribute("transform", `translate(${translateX},${translateY})`);

		this._locs.textContent = this.node_names[d.fromIdx] + " → " + this.node_names[d.toIdx];
		this._date.textContent = d3.timeFormat("%Y-%m-%d")(d.date);
		this._yval.textContent = "Transfers: " + d.value.toFixed(0);

		this.highlight = this.svg
			.append("rect")
			.attr("x", this.x(d.date))
			.attr("y", this.y(d[1]))
			.attr("height", this.y(d[0]) - this.y(d[1]))
			.attr("width", this.binWidth)
			.attr("fill", "none")
			.attr("stroke", "white")
			.attr("stroke-width", "1px");
	}

	hide() {
		this.highlight.remove();
		this.node.setAttribute("display", "none");
	}
}
