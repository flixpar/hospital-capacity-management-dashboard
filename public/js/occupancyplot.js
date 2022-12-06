const occupancyPlotHeight = 400;
const occupancyPlotWidth  = 600;
const occupancyPlotMargin = ({top: 30, right: 30, bottom: 30, left: 40});

const font = "Helvetica";
const axisFontSize = "17px";
const titleFontSize = "22px";

const occupancy_color = "#17AC7B";
const occupancy_notfr_color = "#15ACF8";

const capacityColors = ["gold", "darkorange", "red", "purple", "black"];

const lineWidth = 4;
const bedsLineWidth = 8;

const addPoints = true;

import {makeHorizontalColorScale} from "./common.js";
import {occupancyplotDescription} from "./figure_text.js";

export function createOccupancyPlot(response, add_description=true) {
	const capacity = response.capacity_levels;
	const occupancy = response.occupancy;
	const occupancy_notfr = response.occupancy_notfr;
	const config = response.config;

	const N = capacity.length;
	const T = config.dates.length;
	const C = capacity[0].length;

	const ncols = 3;
	const nrows = Math.ceil(N / ncols);

	let tableEntries = [];
	let table = document.createElement("table");
	for (let i = 0; i < nrows; i++) {
		let row = document.createElement("tr");
		row.style.width = "100%";
		for (let j = 0; j < ncols; j++) {
			let entry = document.createElement("td");
			entry.style.width = "23%";
			row.appendChild(entry);
			tableEntries.push(entry);
		}
		table.appendChild(row);
	}
	table.className = "occupancyplots-table";

	let occupancy_data = [];
	let occupancy_notfr_data = [];
	let capacity_data = [];
	for (let i = 0; i < N; i++) {
		occupancy_data[i] = [];
		occupancy_notfr_data[i] = [];
		capacity_data[i] = [];
		for (let c = 0; c < C; c++) {
			capacity_data[i][c] = [];
		}

		for (let t = 0; t < T; t++) {
			const d = new Date(Date.parse(config.dates[t]));
			occupancy_data[i][t] = {
				"date": d,
				"value": occupancy[i][t],
			};
			occupancy_notfr_data[i][t] = {
				"date": d,
				"value": occupancy_notfr[i][t],
			};
			for (let c = 0; c < C; c++) {
				capacity_data[i][c][t] = {
					"date": d,
					"value": capacity[i][c],
				};
			}
		}
	}
	const data = {
		"occupancy": occupancy_data,
		"occupancy_notfr": occupancy_notfr_data,
		"capacity": capacity_data,
	};

	const x = d3.scaleUtc()
		.domain(d3.extent(config.dates, d => new Date(Date.parse(d))))
		.range([occupancyPlotMargin.left, occupancyPlotWidth - occupancyPlotMargin.right]);

	const xAxis = g => g
		.attr("transform", `translate(0,${occupancyPlotHeight - occupancyPlotMargin.bottom})`)
		.style("font-family", font)
		.style("font-size", axisFontSize)
		.call(d3.axisBottom(x)
			.ticks(d3.timeWeek.every(1))
			.tickSize(-(occupancyPlotHeight - occupancyPlotMargin.top - occupancyPlotMargin.bottom))
			.tickFormat(d3.timeFormat("%m/%d"))
		)
		.call(g => g.select(".domain").remove())
		.call(g => g.selectAll(".tick line")
			.attr("stroke-opacity", 0.5)
			.attr("stroke-dasharray", "4,4"))
		.call(g => g.selectAll(".tick text").attr("dy", "20px"));


	for (let i = 0; i < N; i++) {
		let svg = d3.create("svg")
			.attr("viewBox", [0, 0, occupancyPlotWidth, occupancyPlotHeight]);

		svg.append("text")
			.attr("x", occupancyPlotWidth/2)
			.attr("y", 20)
			.attr("text-anchor", "middle")
			.style("font-family", font)
			.style("font-size", titleFontSize)
			.text(config.node_names[i]);

		const maxOccupancy = d3.max(occupancy[i]);
		const maxOccupancyNoTfr = d3.max(occupancy_notfr[i]);
		const maxY = d3.max([maxOccupancy, maxOccupancyNoTfr, capacity[i][C-1]]);

		const y = d3.scaleLinear()
			.domain([0, maxY]).nice()
			.range([occupancyPlotHeight - occupancyPlotMargin.bottom, occupancyPlotMargin.top]);

		const yAxis = g => g
			.attr("transform", `translate(${occupancyPlotMargin.left},0)`)
			.style("font-family", font)
			.style("font-size", axisFontSize)
			.call(d3.axisRight(y)
				.ticks(4)
				.tickSize(occupancyPlotWidth - occupancyPlotMargin.left - occupancyPlotMargin.right)
			)
			.call(g => g.select(".domain").remove())
			.call(g => g.selectAll(".tick line")
				.attr("stroke-opacity", 0.5)
				.attr("stroke-dasharray", "4,4"))
			.call(g => g.selectAll(".tick text")
				.attr("x", "-10px")
				.attr("dy", "4px")
				.attr("text-anchor", "end")
			);

		const line = d3.line()
			.defined(d => !isNaN(d.value))
			.x(d => x(d.date))
			.y(d => y(d.value));

		svg.append("g")
			.call(xAxis);

		svg.append("g")
			.call(yAxis);

		for (let c = 0; c < C; c++) {
			svg.append("path")
			.datum(data["capacity"][i][c])
			.attr("fill", "none")
			.attr("stroke", capacityColors[c])
			.attr("stroke-width", bedsLineWidth)
			.attr("stroke-linejoin", "round")
			.attr("stroke-linecap", "square")
			.attr("d", line);
		}

		svg.append("path")
			.datum(data["occupancy"][i])
			.attr("fill", "none")
			.attr("stroke", occupancy_color)
			.attr("stroke-width", lineWidth)
			.attr("stroke-linejoin", "round")
			.attr("stroke-linecap", "round")
			.attr("d", line);

		svg.append("path")
			.datum(data["occupancy_notfr"][i])
			.attr("fill", "none")
			.attr("stroke", occupancy_notfr_color)
			.attr("stroke-width", lineWidth)
			.attr("stroke-linejoin", "round")
			.attr("stroke-linecap", "round")
			.attr("d", line);

		if (addPoints) {
			svg.selectAll(".point")
				.data(data["occupancy"][i])
				.enter().append("svg:circle")
				.attr("fill", occupancy_color)
				.attr("stroke", "white")
				.attr("stroke-width", 2)
				.attr("cx", d => x(d.date))
				.attr("cy", d => y(d.value))
				.attr("r", lineWidth+2);

			svg.selectAll(".point")
				.data(data["occupancy_notfr"][i])
				.enter().append("svg:circle")
				.attr("fill", occupancy_notfr_color)
				.attr("stroke", "white")
				.attr("stroke-width", 2)
				.attr("cx", d => x(d.date))
				.attr("cy", d => y(d.value))
				.attr("r", lineWidth+2);
		}

		let svgNode = svg.node();

		const tooltip = new Tooltip(x,y);
		svg.append(() => tooltip.node);

		svgNode.addEventListener("mousemove", event => {
			const tdWidth = svgNode.clientWidth;
			const z = (event.offsetX / tdWidth) * occupancyPlotWidth;
			const w = event.offsetY * (occupancyPlotWidth / tdWidth);
			const d = bisect([data["occupancy"][i], data["occupancy_notfr"][i]], x.invert(z), y.invert(w));
			tooltip.show(d);
		});
		svgNode.addEventListener("mouseleave", () => tooltip.hide());

		svgNode.style.width = "100%";
		tableEntries[i].appendChild(svgNode);
	}

	const section = document.getElementById("section-results-occupancy");

	if (add_description) {
		let description = document.createElement("p");
		description.className = "caption";
		description.innerHTML = occupancyplotDescription;
		section.appendChild(description);
	}

	const occupancyLabels = ["Occupancy (Without Transfers)", "Occupancy (With Transfers)"];
	const occupancyColors = [occupancy_notfr_color, occupancy_color];
	const patientsColorscaleElem = makeHorizontalColorScale(occupancyLabels, occupancyColors);
	section.appendChild(patientsColorscaleElem);

	const capacityNames = response.config.capacity_names;
	const capacityColorscaleElem = makeHorizontalColorScale(capacityNames, capacityColors);
	section.appendChild(capacityColorscaleElem);

	section.appendChild(table);
}

const bisectDate = d3.bisector(d => d.date).left;
function bisect(lines, date, yval) {
	const line1 = lines[0];
	const T = line1.length;
	const i = bisectDate(line1, date, 1);
	const a = line1[(i<=0)?0:(i-1)], b = line1[(i>=T)?(T-1):i];
	const d = date - a.date > b.date - date ? b.date : a.date;
	const v = lines.map(l => l.findIndex(x => x.date == d));
	const j = d3.minIndex(v.map((x,k) => Math.abs(lines[k][x].value - yval)));
	return lines[j][v[j]];
}

class Tooltip {
	constructor(x,y) {
		this._x = x;
		this._y = y;

		let tmpSVG = d3.create("svg");
		let tmpNode = tmpSVG.append("g")
			.attr("pointer-events", "none")
			.attr("display", "none")
			.attr("font-family", font)
			.attr("font-size", "20px")
			.attr("text-anchor", "middle");

		tmpNode.append("rect")
			.attr("x", -60)
			.attr("y", -70)
			.attr("width", 120)
			.attr("height", 50)
			.attr("fill", "white")
			.attr("stroke", "gray")
			.attr("stroke-width", 1.5);
		tmpNode.append("rect")
			.attr("transform", "translate(0, -35) rotate(45)")
			.attr("width", 18)
			.attr("height", 18)
			.attr("fill", "white")
			.attr("stroke", "gray")
			.attr("stroke-width", 1.5);
		tmpNode.append("rect")
			.attr("x", -60)
			.attr("y", -70)
			.attr("width", 120)
			.attr("height", 50)
			.attr("fill", "white");

		this._date = tmpNode.append("text").attr("y", "-50").node();
		this._yval = tmpNode.append("text").attr("y", "-25").node();

		tmpNode.append("circle")
			.attr("stroke", "black")
			.attr("fill", "none")
			.attr("r", 6);

		this.node = tmpNode.node();
	}

	show(d) {
		this.node.removeAttribute("display");
		this.node.setAttribute("transform", `translate(${this._x(d.date)},${this._y(d.value)})`);
		this._date.textContent = d3.timeFormat("%Y-%m-%d")(d.date);
		this._yval.textContent = d.value.toFixed(0);
	}

	hide() {
		this.node.setAttribute("display", "none");
	}
}
