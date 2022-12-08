export { createCapacityPlot };


const traceColors = ["#006C67", "#B9314F", "#454E9E", "#95B46A", "#B6C2D9", "#9370DB", "blue"];

function createCapacityPlot(response) {
	const capacity = response.capacity;
	const N = capacity.length;
	const T = capacity[0].length;

	const x = response.config.dates;

	const traces = d3.range(N).map((i) => {
		const y = d3.range(T).map((t) => capacity[i][t]);
		const t = {
			x,
			y,
			type: "scatter",
			mode: "lines",
			name: response.config.node_names[i],
			line: {
				color: traceColors[i],
				width: 3,
			},
		};
		return t;
	});

	const layout = {
		xaxis: {
			title: "Date",
			tickformat: "%Y-%m-%d",
		},
		yaxis: {
			title: "Capacity",
			rangemode: "tozero",
		},
		font: {
			family: "Helvetica, Arial, sans-serif",
		}
	};

	const config = {
		scrollZoom: false,
		toImageButtonOptions: {
			format: "svg",
			filename: "capacity_plot",
			height: 500,
			width: 900,
			scale: 1,
		},
		modeBarButtonsToRemove: ["zoom2d", "pan2d", "select2d", "lasso2d", "zoomIn2d", "zoomOut2d", "autoScale2d", "resetScale2d"],
	};

	let section = document.getElementById("section-results-capacity");
	let wrapper = document.createElement("div");
	wrapper.id = "capacity-plot-wrapper";
	section.appendChild(wrapper);
	Plotly.newPlot("capacity-plot-wrapper", traces, layout, config);
}
