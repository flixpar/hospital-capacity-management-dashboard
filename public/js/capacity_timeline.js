const capacityTimelinePlotMargins = {left: 30, right: 2, top: 0, bottom: 15};
const capacityTimelinePlotSize = {width: 600, height: 200};

const capacityTimelineBarPadding = {height: 2, width: 0};
const capacityTimelineBarMargins = {left: 0, right: 0, top: 2, bottom: 2};

const capacityTimelineColorscale = {
	"-1": "black",
	0: "seagreen",
	1: "gold",
	2: "darkorange",
	3: "red",
	4: "purple",
};

import {capacityTimelineDescription} from "./figure_text.js";

export {createCapacityTimeline};


function createCapacityTimeline(response, add_description=true) {
	const section = document.getElementById("section-results-dashboard");
	if (add_description) {
		let description = document.createElement("p");
		description.innerHTML = capacityTimelineDescription;
		section.appendChild(description);
	}

	let title = document.createElement("h5");
	title.className = "title is-5";
	title.style.textAlign = "center";
	title.textContent = "Capacity Timeline";
	section.appendChild(title);

	const fig = makeCapacityTimeline(response, true, true);
	section.appendChild(fig);
}

function makeCapacityTimeline(response, addLabels=false, withTransfers=true) {
	let svg = d3.create("svg").attr("viewBox", [0, 0, capacityTimelinePlotSize.width, capacityTimelinePlotSize.height]);

	const N = response.config.node_names.length;

	const subplotSize = {
		width: capacityTimelinePlotSize.width - (capacityTimelinePlotMargins.left + capacityTimelinePlotMargins.right) - N*(capacityTimelineBarMargins.left + capacityTimelineBarMargins.right),
		height: (capacityTimelinePlotSize.height - (capacityTimelinePlotMargins.top + capacityTimelinePlotMargins.bottom) - N*(capacityTimelineBarMargins.top + capacityTimelineBarMargins.bottom)) / N,
	};

	svg = makeCapacityTimelineAxis(svg, response, subplotSize);

	const tooltip = new CapacityTimelineTooltip(svg, response);

	for (let i = 0; i < N; i++) {
		const offsetLeft = capacityTimelinePlotMargins.left + capacityTimelineBarMargins.left;
		const offsetTop = capacityTimelinePlotMargins.top + (i * (capacityTimelineBarMargins.top + capacityTimelineBarMargins.bottom + subplotSize.height));
		let g = svg.append("g").attr("transform", `translate(${offsetLeft},${offsetTop})`);
		g = makeCapacityTimelineSubplot(g, response, i, tooltip, subplotSize, addLabels, withTransfers);
	}

	svg = makeCapacityTimelineLegend(svg, response);

	svg.append(() => tooltip.node);

	return svg.node();
}

function makeCapacityTimelineSubplot(svg, response, locIdx, tooltip, plotSize, addLabels=false, withTransfers=true) {

	const dates = response.config.dates.map(d => new Date(d));
	const x = d3.scaleUtc()
		.domain(d3.extent(dates))
		.range([0, plotSize.width]);

	svg.append("text")
		.style("text-anchor", "center")
		.style("font-family", "sans-serif")
		.style("font-size", 8)
		.attr("fill", "#4d4d4d")
		.attr("text-anchor", "end")
		.attr("x", -4)
		.attr("y", (plotSize.height/2) + 2)
		.text(response.config.node_names[locIdx]);

	const timelineData = computeCapacityTimelineData(response, locIdx, withTransfers);

	Date.prototype.addDays = function(days) {
		let date = new Date(this.valueOf());
		date.setDate(date.getDate() + days);
		return date;
	}

	svg.append("g")
		.selectAll("rect")
		.data(timelineData)
		.join("rect")
		.attr("x", d => x(d.startDate) + capacityTimelineBarPadding.width)
		.attr("y", d => capacityTimelineBarPadding.height)
		.attr("height", plotSize.height - 2*capacityTimelineBarPadding.height)
		.attr("width", d => x(d.endDate.addDays(1)) - x(d.startDate) - 2*capacityTimelineBarPadding.width)
		.attr("fill", d => d.color)
		.on("mouseover", (e,d) => tooltip.show(e,d,locIdx))
		.on("mouseout", (e,d) => tooltip.hide(e,d));

	if (addLabels) {
		const C = response.config.capacity_names.length;

		svg.append("g")
			.selectAll("text")
			.data(timelineData)
			.join("text")
			.attr("pointer-events", "none")
			.attr("x", d => {
				const barStart = x(d.startDate) + capacityTimelineBarPadding.width;
				const barWidth = x(d.endDate.addDays(1)) - x(d.startDate) - 2*capacityTimelineBarPadding.width;
				return barStart + barWidth/2;
			})
			.attr("y", d => {
				const barTop = capacityTimelineBarPadding.height;
				const barHeight = plotSize.height - 2*capacityTimelineBarPadding.height;
				return barTop + barHeight/2;
			})
			.attr("text-anchor", "middle")
			.attr("alignment-baseline", "central")
			.style("font-family", "sans-serif")
			.style("font-size", 8)
			.attr("fill", d => {
				return (d.color == "black") ? "white" : "black";
			})
			.text(d => {
				let capacityName = response.config.capacity_names[d.capacityLevel];
				if (d.capacityLevel < 0) {
					capacityName = "Over " + response.config.capacity_names[C-1];
				}

				const barWidth = x(d.endDate.addDays(1)) - x(d.startDate) - 2*capacityTimelineBarPadding.width;
				const textWidth = capacityName.length * 8 * 0.5 + 10;

				if (barWidth > textWidth) {
					return capacityName;
				} else {
					return "";
				}
			});
	}

	return svg;
}

function makeCapacityTimelineAxis(svg, response, subplotSize) {

	const dates = response.config.dates.map(d => new Date(d));
	const xScale = d3.scaleUtc()
		.domain(d3.extent(dates))
		.range([0, subplotSize.width]);

	const xAxis = g => g
		.attr("transform", `translate(${capacityTimelinePlotMargins.left},${capacityTimelinePlotSize.height-capacityTimelinePlotMargins.bottom})`)
		.style("font-family", "monospace")
		.style("font-size", "8px")
		.call(d3.axisBottom(xScale)
			// .ticks(d3.utcWeek.every(1))
			.ticks(d3.utcDay.every(1))
			.tickSize(-capacityTimelinePlotSize.height)
			.tickFormat("")
		)
		.call(g => g.select(".domain").remove())
		.call(g => g.selectAll(".tick line")
			.attr("stroke-width", 0.25)
			.attr("stroke-opacity", 0.5)
			.attr("stroke-dasharray", "5,5")
		);

	svg.append("g")
		.call(xAxis);

	// const dateFormat = "%m/%d";
	const dateFormat = "%m/%d/%y";
	// const dateFormat = "%Y-%m-%d";

	const xAxisLabels = g => g
		.attr("transform", `translate(${capacityTimelinePlotMargins.left},${capacityTimelinePlotSize.height-10})`)
		.style("font-family", "monospace")
		.style("font-size", "8px")
		.call(d3.axisBottom(xScale)
			.ticks(d3.utcWeek.every(1))
			.tickSize(-6)
			.tickFormat(d3.timeFormat(dateFormat))
		)
		.call(g => g.select(".domain").remove())
		.call(g => g.selectAll(".tick text")
			.attr("dy", 6)
		)
		.call(g => g.selectAll(".tick line")
			.attr("stroke-width", 0.5)
			.attr("stroke-opacity", 1.0)
		);

	svg.append("g")
		.call(xAxisLabels);

	return svg;
}

function makeCapacityTimelineLegend(svg, response) {

	let legendHeight;
	let legendG = svg.append("g").attr("transform", `translate(0,${capacityTimelinePlotSize.height})`);

	let legendLabels = [];
	let legendColors = [];

	const C = response.config.capacity_names.length;
	for (let c = 0; c <= C; c++) {
		if (c < C) {
			legendLabels.push(response.config.capacity_names[c]);
			legendColors.push(capacityTimelineColorscale[c]);
		} else {
			legendLabels.push("Over " + response.config.capacity_names[C-1]);
			legendColors.push(capacityTimelineColorscale[-1]);
		}
	}

	legendG, legendHeight = makeMultiRowLegend(legendG, legendLabels, legendColors, capacityTimelinePlotSize.width);

	svg.attr("viewBox", [0, 0, capacityTimelinePlotSize.width, capacityTimelinePlotSize.height+legendHeight]);

	return svg;
}

function makeMultiRowLegend(svg, labels, colors, totalWidth) {
	const N = labels.length;

	const maxNameLength = d3.max(labels, x => x.length);
	const rowHeight = 9;
	const colWidth = (maxNameLength * (rowHeight-2) * 0.5) + rowHeight + 5 + 10;

	const maxCols = Math.floor(totalWidth / colWidth);
	const nRows = Math.ceil(N / maxCols);
	const nCols = Math.min(maxCols, N);

	const actualWidth = colWidth * nCols;
	const marginLeft  = (totalWidth - actualWidth) / 2;
	const marginTop   = 10;

	const totalHeight = (nRows * rowHeight) + marginTop + 5;

	const debug = false;

	for (let i = 0; i < nRows; i++) {
		for (let j = 0; j < nCols; j++) {
			const k = (i*nCols) + j;
			if (k >= N) continue;

			svg.append("rect")
				.attr("x", marginLeft + ( colWidth * j))
				.attr("y", marginTop  + (rowHeight * i))
				.attr("width", rowHeight)
				.attr("height", rowHeight)
				.attr("rx", 3)
				.attr("ry", 3)
				.attr("fill", colors[k])
				.attr("stroke", "none");

			svg.append("text")
				.attr("x", marginLeft + ( colWidth * j) + rowHeight + 4)
				.attr("y", marginTop  + (rowHeight * (i+0.5)))
				.attr("text-anchor", "start")
				.attr("alignment-baseline", "central")
				.style("font-family", "sans-serif")
				.style("font-size", rowHeight-2)
				.text(labels[k]);

			if (debug) {
				svg.append("rect")
					.attr("x", marginLeft + ( colWidth * j))
					.attr("y", marginTop  + (rowHeight * i))
					.attr("width", colWidth)
					.attr("height", rowHeight)
					.attr("fill", "none")
					.attr("stroke", "gray");
			}
		}
	}

	if (debug) {
		svg.append("rect")
			.attr("x", marginLeft)
			.attr("y", 0)
			.attr("width", actualWidth)
			.attr("height", totalHeight)
			.attr("fill", "none")
			.attr("stroke", "blue");
	}

	return svg, totalHeight;
}

function computeCapacityTimelineData(response, locIdx, withTransfers=true) {
	const dates = response.config.dates.map(d => new Date(d));
	const T = dates.length;

	let timelineData = [];
	let prevLevel = null;
	let startDate = 0;
	for (let t = 0; t < T; t++) {
		const activeToday = withTransfers ? response.active[locIdx][t] : response.active_null[locIdx][t];
		let currentLevel = response.capacity[locIdx].findIndex(c => (c+0.9) >= activeToday);
		// currentLevel = response.capacity[locIdx].lastIndexOf(response.capacity[locIdx][currentLevel]);
		if (currentLevel != prevLevel && t != 0) {
			timelineData.push({
				startDate: dates[startDate],
				endDate: dates[t-1],
				capacityLevel: prevLevel,
				color: capacityTimelineColorscale[prevLevel],
			});
			startDate = t;
			prevLevel = currentLevel;
		}
		if (t == 0) {
			prevLevel = currentLevel;
		}
	}
	timelineData.push({
		startDate: dates[startDate],
		endDate: dates[T-1],
		capacityLevel: prevLevel,
		color: capacityTimelineColorscale[prevLevel],
	});

	return timelineData;
}

class CapacityTimelineTooltip {
	constructor(svg, response) {
		this.svg = svg;
		this.response = response;
		this.highlight = null;

		const N = response.config.node_names.length;
		this.subplotSize = {
			width: capacityTimelinePlotSize.width - (capacityTimelinePlotMargins.left + capacityTimelinePlotMargins.right) - N*(capacityTimelineBarMargins.left + capacityTimelineBarMargins.right),
			height: (capacityTimelinePlotSize.height - (capacityTimelinePlotMargins.top + capacityTimelinePlotMargins.bottom) - N*(capacityTimelineBarMargins.top + capacityTimelineBarMargins.bottom)) / N,
		};

		const dates = response.config.dates.map(d => new Date(d));
		this.xScale = d3.scaleUtc()
			.domain(d3.extent(dates))
			.range([0, this.subplotSize.width]);

		let tmpSVG = d3.create("svg");
		let tooltipNode = tmpSVG.append("g")
			.attr("pointer-events", "none")
			.attr("display", "none")
			.attr("font-family", "monospace")
			.attr("font-size", "7px")
			.attr("text-anchor", "middle");

		tooltipNode.append("rect")
			.attr("x", -60)
			.attr("y", -35)
			.attr("width", 120)
			.attr("height", 30)
			.attr("fill", "white")
			.attr("stroke", "gray")
			.attr("stroke-width", 1.5);
		this.topTab = tooltipNode.append("rect")
			.attr("transform", "translate(0, -39) rotate(45)")
			.attr("width", 12)
			.attr("height", 12)
			.attr("fill", "white")
			.attr("stroke", "gray")
			.attr("stroke-width", 1.0);
		this.bottomTab = tooltipNode.append("rect")
			.attr("transform", "translate(0, -18) rotate(45)")
			.attr("width", 12)
			.attr("height", 12)
			.attr("fill", "white")
			.attr("stroke", "gray")
			.attr("stroke-width", 1.0);
		tooltipNode.append("rect")
			.attr("x", -60)
			.attr("y", -35)
			.attr("width", 120)
			.attr("height", 30)
			.attr("fill", "white");

		this.tooltipNode = tooltipNode;

		this.textLine1 = tooltipNode.append("text").attr("y", "-26").node();
		this.textLine2 = tooltipNode.append("text").attr("y", "-17").node();
		this.textLine3 = tooltipNode.append("text").attr("y", "-8").node();

		this.node = tooltipNode.node();
	}

	show(e,d,locIdx) {
		this.node.removeAttribute("display");

		let capacityName = this.response.config.capacity_names[d.capacityLevel];
		if (d.capacityLevel < 0) {
			const C = this.response.config.capacity_names.length;
			capacityName = "Over " + this.response.config.capacity_names[C-1];
		}

		this.textLine1.textContent = this.response.config.node_names[locIdx];
		this.textLine2.textContent = capacityName;
		this.textLine3.textContent = d.startDate.toISOString().substr(0,10) + " - " + d.endDate.toISOString().substr(0,10);

		this.highlight = e.srcElement.cloneNode();
		this.highlight.setAttribute("fill", "none");
		this.highlight.setAttribute("stroke", "gray");
		this.highlight.setAttribute("stroke-width", "1.5px");
		e.srcElement.parentElement.appendChild(this.highlight);

		const offsetLeft = capacityTimelinePlotMargins.left + capacityTimelineBarMargins.left;
		const offsetTop = capacityTimelinePlotMargins.top + (locIdx * (capacityTimelineBarMargins.top + capacityTimelineBarMargins.bottom + this.subplotSize.height));

		const barX = this.xScale(d.startDate) + capacityTimelineBarPadding.width;
		const barWidth = this.xScale(d.endDate) - this.xScale(d.startDate) - 2*capacityTimelineBarPadding.width;

		this.node.setAttribute("transform", `translate(${offsetLeft},${offsetTop}) translate(${barX + (barWidth/2)},0)`);

		const flip = locIdx == 0;
		if (flip) {
			const barHeight = this.subplotSize.height - 2*capacityTimelineBarPadding.height;
			this.node.setAttribute("transform", `translate(${offsetLeft},${offsetTop}) translate(${barX + (barWidth/2)},${barHeight}) translate(0,${barHeight+14})`);
			this.topTab.node().removeAttribute("display");
			this.bottomTab.node().setAttribute("display", "none");
		} else {
			this.topTab.node().setAttribute("display", "none");
			this.bottomTab.node().removeAttribute("display");
		}
	}

	hide(e,d) {
		if (this.highlight != null) {
			this.highlight.remove();
			this.highlight = null;
		}
		this.node.setAttribute("display", "none");
	}
}
