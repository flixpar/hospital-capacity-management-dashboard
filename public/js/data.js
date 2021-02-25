import {makeJHHSDashboard} from "./dashboard.js";
import {makeCapacityTimeline} from "./capacity_timeline.js";
import {makeDataCompareFigure} from "./data_compare.js";


const RootComponent = {
	data() {
		return {
			status: "loading",
			response: null,
			params: {scenario: "moderate", patienttype: "total"},
		}
	},
	methods: {},
	watch: {
		params: {
			handler() {updateData()},
			deep: true,
		},
	},
};

const app = Vue.createApp(RootComponent);
app.config.isCustomElement = tag => tag.startsWith("ion-");

app.component("result-section", {
	props: ["title", "sectionId"],
	template: `
		<div class="results-section">
			<div class="results-section-header" v-bind:data-target="'section-'+sectionId" @click.stop="toggleSection">
				<h3 class="title is-3 results-section-header-text">{{title}}</h3>
				<a class="section-toggle-button" v-bind:data-target="'section-'+sectionId">
					<span class="icon section-toggle-icon">
						<ion-icon name="chevron-down-outline" role="img" class="md hydrated" aria-label="chevron down outline"></ion-icon>
					</span>
				</a>
			</div>
			<div class="results-section-content is-collapsible" v-bind:id="'section-'+sectionId">
				<slot></slot>
			</div>
		</div>
	`,
	methods: {
		toggleSection,
	}
});

app.component("fig", {
	props: ["type", "args"],
	template: `<div class="figure-component></div>`,
	mounted() {
		if (this.$root.status != "loaded") {}
		else if (this.type == "data-compare") {
			const fig = createDataCompare(this.$root.response, ...this.args);
			this.$el.appendChild(fig);
		} else if (this.type == "capacity-timeline") {
			const fig = createCapacityTimeline(this.$root.response);
			this.$el.appendChild(fig);
		} else if (this.type == "dashboard") {
			const fig = createJHHSDashboard(this.$root.response);
			this.$el.appendChild(fig);
		}
	}
});

function toggleSection(e) {
	const target = e.currentTarget;
	const i = target.dataset.target;
	const c = document.getElementById(i);
	const icon = target.querySelector("ion-icon");
	if (c.style.display != "none") {
		c.style.display = "none";
		icon.setAttribute("name", "chevron-back-outline");
	} else {
		c.style.display = "block";
		icon.setAttribute("name", "chevron-down-outline");
	}
}

const vm = app.mount("#all-content");

function unproxy(x) {
	return JSON.parse(JSON.stringify(x));
}

function convertData(response, datatype="realdata") {
	let data = {
		active: d3.transpose(response[datatype].active),
		active_null: d3.transpose(response[datatype].active),
		beds: response.capacity[0],
		capacity: d3.transpose(response.capacity),
		config: {
			dates: response[datatype].meta.date_range,
			node_names: response.hospitals,
			capacity_names: response.meta.capacity_names,
		},
	};
	data = unproxy(data);
	return data;
}

function createJHHSDashboard(response) {
	const data = convertData(response);
	const fig = makeJHHSDashboard(data);
	return fig;
}

function createCapacityTimeline(response) {
	const data = convertData(response);
	const fig = makeCapacityTimeline(data, true, false);
	return fig;
}

function createDataCompare(response, datatype) {
	const fig = makeDataCompareFigure(unproxy(response), datatype);
	return fig;
}

function updateData() {
	const scenario = vm.params.scenario;
	const patienttype = vm.params.patienttype;
	vm.status = "loading";
	fetch(`/api/data?scenario=${scenario}&patienttype=${patienttype}`)
		.then(response => response.json())
		.then(data => {
			console.log(data);
			vm.$data.response = data;
			vm.$data.status = "loaded";
		});
}
updateData();
