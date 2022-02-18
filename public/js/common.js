export {
	toTitlecase,
	getSection,
	createInfo,
	createSelect,
	getDateIntervals,
	makeHorizontalColorScale,
	makeLegend,
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
	tippy(el, {delay: [null, 250]});
	if (parentElement != null) {
		parentElement.appendChild(el);
	}
	return el;
}

function createSelect(options, params={}) {
	let select = document.createElement("select");
	let selectWrapper = document.createElement("div");
	let selectContainer = document.createElement("div");

	options.forEach(o => {
		let opt = document.createElement("option");
		opt.text = o.text;
		opt.value = (o.value == null) ? o.text : o.value;
		if (opt.value == params.defaultValue) {
			opt.selected = true;
		}
		select.appendChild(opt);
	});

	let selectLabel;
	if (params.label != null) {
		selectLabel = document.createElement("label");
		selectLabel.textContent = params.label;
		selectLabel.style.marginRight = "20px";
		selectContainer.appendChild(selectLabel);
	}

	if (params.id != null) {
		select.id = params.id;
		if (params.label != null) {
			selectLabel.htmlFor = params.id;
		}
	}

	selectContainer.className = "field";
	selectContainer.style.display = "flex";
	selectContainer.style.justifyContent = "center";
	selectContainer.style.alignItems = "center";

	selectWrapper.className = "select is-fullwidth";
	selectWrapper.style.width = "35%";
	selectWrapper.style.minWidth = "fit-content";
	selectWrapper.style.marginTop = "10px";
	selectWrapper.style.marginBottom = "10px";

	selectWrapper.appendChild(select);
	selectContainer.appendChild(selectWrapper);

	return selectContainer;
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
	} else if (T < 365) {
		xInterval = d3.utcMonth.every(1);
	} else if (T < 730) {
		xInterval = d3.utcMonth.every(2);
	} else if (T < 1095) {
		xInterval = d3.utcMonth.every(4);
	} else {
		xInterval = d3.utcMonth.every(6);
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

function makeLegend(svg, labels, colors, singleRow=true, position="bottom", debug=false) {
	let legendG = svg.append("g");

	const N = labels.length;

	const maxNameLength = d3.max(labels, x => x.length);
	const rowHeight = 9;
	const colWidth = (maxNameLength * (rowHeight-2) * 0.5) + rowHeight + 5 + 10;

	let viewBox = svg.attr("viewBox").split(",").map(z => parseFloat(z));
	const totalWidth = viewBox[2];

	const maxCols = Math.floor(totalWidth / colWidth);
	const nRows = singleRow ? 1 : Math.ceil(N / maxCols);
	const nCols = singleRow ? N : Math.min(maxCols, N);

	const actualWidth  = colWidth * nCols;
	const marginLeft   = (totalWidth - actualWidth) / 2;
	const marginTop    = (position == "bottom") ? 10 :  2;
	const marginBottom = (position == "bottom") ? 10 : 13;

	const totalHeight = (nRows * rowHeight) + marginTop + marginBottom;

	for (let i = 0; i < nRows; i++) {
		for (let j = 0; j < nCols; j++) {
			const k = (i*nCols) + j;
			if (k >= N) continue;

			legendG.append("rect")
				.attr("x", marginLeft + ( colWidth * j))
				.attr("y", marginTop  + (rowHeight * i))
				.attr("width", rowHeight)
				.attr("height", rowHeight)
				.attr("rx", 3)
				.attr("ry", 3)
				.attr("fill", colors[k])
				.attr("stroke", "none");

				legendG.append("text")
				.attr("x", marginLeft + ( colWidth * j) + rowHeight + 4)
				.attr("y", marginTop  + (rowHeight * (i+0.5)))
				.attr("text-anchor", "start")
				.attr("alignment-baseline", "central")
				.style("font-family", "sans-serif")
				.style("font-size", rowHeight-2)
				.text(labels[k]);

			if (debug) {
				legendG.append("rect")
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
		legendG.append("rect")
			.attr("x", marginLeft)
			.attr("y", 0)
			.attr("width", actualWidth)
			.attr("height", totalHeight)
			.attr("fill", "none")
			.attr("stroke", "blue");
	}

	const offsetY = (position == "bottom") ? viewBox[3] : viewBox[1]-totalHeight;
	legendG.attr("transform", `translate(0, ${offsetY})`);

	if (position == "top") {
		viewBox[1] -= totalHeight;
	}

	viewBox[3] += totalHeight;
	svg.attr("viewBox", viewBox);

	return svg;
}
