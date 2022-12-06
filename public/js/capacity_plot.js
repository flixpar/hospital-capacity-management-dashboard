export { createCapacityPlot };

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
		};
		return t;
	});

	const layout = {
		title: "Capacity",
		xaxis: {
			title: "Date",
			showgrid: false,
			zeroline: false,
		},
		yaxis: {
			title: "Capacity",
			showline: false,
			rangemode: "tozero",
		},
	};

	Plotly.newPlot("section-results-capacity", traces, layout);
}
