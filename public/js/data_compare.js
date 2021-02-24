export {makeDataCompareFigure};

const lineColors = {
	"BMC": "#006C67",
	"HCGH": "#B9314F",
	"JHH": "#454E9E",
	"SH": "#95B46A",
	"SMH": "#B6C2D9",
	"BCC": "#9370DB",
	"default": "blue",
};
const capacityColors = ["gold", "darkorange", "red", "purple", "black"];
const axisColor = "#4a4a4a";

const font = "Helvetica, sans-serif";
const fontSizes = {
	axis: 8,
	title: 10,
};

const lineWidth = 1.0;

const figureMargins = {left: 5, right: 5, top: 5, bottom: 5};
const plotMargins   = {left: 0, right: 0, top: 0, bottom: 0, between: 20};
const plotPadding   = {left: 25, right: 0, top: 16, bottom: 30};
const plotSize      = {height: 200, width: 600};


function makeDataCompareFigure(response, datatype) {
	const N = response.hospitals.length;

	const totalWidth = plotSize.width + plotMargins.left + plotMargins.right + figureMargins.left + figureMargins.right;
	const totalHeight = figureMargins.top + figureMargins.bottom + N * (plotSize.height + plotMargins.top + plotMargins.bottom) + (N - 1) * (plotMargins.between);
	const svg = d3.create("svg").attr("viewBox", [0, 0, totalWidth, totalHeight]);

	for (let i = 0; i < N; i++) {
		let container = svg.append("g").attr("transform", `translate(${figureMargins.left + plotMargins.left}, ${figureMargins.top + i * (plotMargins.top + plotSize.height + plotMargins.between + plotMargins.bottom)})`);
		container = plotHospital(response, datatype, i, container, svg);
	}

	return svg.node();
}

function plotHospital(response, datatype, locIdx, container, svg) {

	const data = extractData(response, datatype, locIdx);

	const plotInnerSize = { width: plotSize.width - plotPadding.left - plotPadding.right, height: plotSize.height - plotPadding.top - plotPadding.bottom };

	const xScale = d3.scaleUtc()
		.domain(d3.extent(data.meta.dates))
		.range([plotPadding.left, plotPadding.left + plotInnerSize.width]);
	const yScale = d3.scaleLinear()
		.domain([0, data.meta.maxY]).nice()
		.range([plotSize.height - plotPadding.bottom, plotPadding.top]);

	const xAxis = g => g
		.attr("transform", `translate(${0},${plotSize.height - plotPadding.bottom})`)
		.style("font-family", font)
		.style("font-size", fontSizes.axis)
		.call(d3.axisBottom(xScale)
			.ticks(d3.timeWeek.every(8))
			.tickSizeOuter(4)
			.tickFormat(d3.timeFormat("%Y-%m-%d"))
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
		.attr("transform", `translate(${plotPadding.left},0)`)
		.call(d3.axisLeft(yScale)
			.ticks(4)
			.tickSize(-plotInnerSize.width)
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
			.attr("font-family", font)
			.attr("font-size", fontSizes.axis)
		);

	container.append("g")
		.call(xAxis);
	container.append("g")
		.call(yAxis);

	container = plotData(data.longterm, xScale, yScale, container, "blue");
	container = plotData(data.shortterm, xScale, yScale, container, "green");
	container = plotData(data.realdata, xScale, yScale, container, "black");

	const yAxisText = (datatype == "active" ? "Occupancy" : "Admissions");
	container.append("text")
		.attr("transform", `translate(4, ${plotSize.height / 2}) rotate(-90)`)
		.attr("text-anchor", "middle")
		.style("font-family", font)
		.style("font-size", fontSizes.axis)
		.text(yAxisText);

	const titleText = (datatype == "active" ? "COVID Occupancy: " : "COVID Patient Admissions: ") + response.hospitals[locIdx];
	container.append("text")
		.attr("x", plotSize.width / 2)
		.attr("y", 5)
		.attr("text-anchor", "middle")
		.style("font-family", font)
		.style("font-size", fontSizes.title)
		.text(titleText);

	return container;
}

function extractData(response, datatype, locIdx) {
	const realdataX = response.realdata.meta.date_range.map(d => new Date(d));
	const realdataY = response.realdata[datatype].map(x => x[locIdx]);
	const realdataData = realdataX.map((x, i) => ({ date: x, value: realdataY[i], label: "Real Data" }));

	const longtermX = response.longterm.meta.date_range.map(d => new Date(d));
	const longtermY = response.longterm[datatype].map(x => x[locIdx]);
	const longtermData = longtermX.map((x, i) => ({ date: x, value: longtermY[i], label: "Long-Term Forecast" }));

	const shorttermX = response.shortterm.meta.date_range.map(d => new Date(d));
	const shorttermY = response.shortterm[datatype].map(x => x[locIdx]);
	const shorttermData = shorttermX.map((x, i) => ({ date: x, value: shorttermY[i], label: "Short-Term Forecast" }));

	let allDates = realdataX.concat(longtermX).concat(shorttermX);
	allDates = [...new Set(allDates)];

	const maxY = d3.max([d3.max(realdataY), d3.max(longtermY), d3.max(shorttermY)]);

	return {
		realdata: realdataData,
		longterm: longtermData,
		shortterm: shorttermData,
		meta: { dates: allDates, maxY: maxY, datatype: datatype },
	}
}

function plotData(data, xScale, yScale, container, lineColor) {

	const line = d3.line()
		.defined(d => !isNaN(d.value) && d.value != null)
		.x(d => xScale(d.date))
		.y(d => yScale(d.value));

	container.append("path")
		.datum(data)
		.attr("fill", "none")
		.attr("stroke", lineColor)
		.attr("stroke-width", lineWidth)
		.attr("stroke-linejoin", "round")
		.attr("stroke-linecap", "round")
		.attr("d", line);

	return container;
}
