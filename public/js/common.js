export {
	toTitlecase,
	getSection,
	createInfo,
	getDateIntervals,
	makeHorizontalColorScale,
};

const toTitlecase = s => s.split(' ').map(w => w[0].toUpperCase() + w.substr(1)).join(' ');

function getSection(sectionID) {
	sectionID = "section-" + sectionID;
	return document.getElementById(sectionID);
}

function createInfo(parentElement, content) {
	let el = document.createElement("img");
	el.src = "img/info.svg";
	el.className = "info-icon";
	el.setAttribute("data-tippy-content", content);
	parentElement.appendChild(el);
	tippy(el, {delay: [null, 250]});
}

function getDateIntervals(dates) {
	const T = (dates[dates.length-1] - dates[0]) / 86400000;
	let xInterval = d3.utcWeek.every(1);
	if (T < 5) {
		xInterval = d3.utcDay.every(1);
	} else if (T < 7) {
		xInterval = d3.utcDay.every(2);
	} else if (T < 14) {
		xInterval = d3.utcDay.every(3);
	} else if (T < 21) {
		xInterval = d3.utcDay.every(5);
	} else if (T < 31) {
		xInterval = d3.utcWeek.every(1);
	} else if (T < 60) {
		xInterval = d3.utcWeek.every(2);
	} else if (T < 120) {
		xInterval = d3.utcWeek.every(3);
	} else {
		xInterval = d3.utcMonth.every(1);
	}
	return xInterval;
}

function makeHorizontalColorScale(labels, colors) {
	const C = labels.length;

	const totalWidth = document.getElementById("results-container").clientWidth;

	const maxLabelLength = d3.max(labels, x => x.length);
	const colWidth = (maxLabelLength * 4.5) + 14 + 20;

	const actualWidth = colWidth * C;
	const marginLeft  = (totalWidth - actualWidth) / 2;

	const svg = d3.create("svg")
		.attr("viewBox", [0, 0, totalWidth, 20]);

	for (let c = 0; c < C; c++) {

		const offset = c * colWidth;

		svg.append("rect")
			.attr("x", marginLeft + 2 + offset)
			.attr("y", 2)
			.attr("width", 10)
			.attr("height", 10)
			.attr("fill", colors[c])
			.attr("stroke", "none");

		svg.append("text")
			.attr("x", marginLeft + 18 + offset)
			.attr("y", 10)
			.attr("text-anchor", "start")
			.style("font-family", "sans-serif")
			.style("font-size", "10px")
			.text(labels[c]);

	}

	let colorscale = svg.node();

	let colorscaleElem = document.createElement("div");
	colorscaleElem.style.padding = "0";
	colorscaleElem.appendChild(colorscale);

	return colorscaleElem;
}
