import {makeJHHSDashboard} from "./dashboard.js";
import {makeCapacityTimeline} from "./capacity_timeline.js";
import {makeDataCompareFigure} from "./data_compare.js";
import {generateFigureDownloadButtons} from "./figuredl.js";


const RootComponent = {
	data() {
		return {
			status: "loading",
			response: null,
			params: {scenario: "none", patienttype: "icu"},
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
	template: `<div class="figure-component"></div>`,
	mounted() {
		let fig = null;
		if (this.$root.status != "loaded") {return;}
		else if (this.type == "data-compare") {
			fig = createDataCompare(this.$root.response, ...this.args);
		} else if (this.type == "capacity-timeline") {
			fig = createCapacityTimeline(this.$root.response);
		} else if (this.type == "dashboard") {
			fig = createJHHSDashboard(this.$root.response);
		}
		this.$el.appendChild(fig);
		generateFigureDownloadButtons(fig, this.type);
	},
});

app.component("fig-options", {
	props: {
		type: {type: String, required: true},
		options: {type: Object, required: true},
		showOptions: {type: Boolean, required: false, default: true},
	},
	template: `
		<div class="figure-component">
			<div class="select is-fullwidth" style="width: 50%; left: 25%; margin-bottom: 15px;" v-if="showOptions">
				<select v-model="arg">
					<option v-for="opt in opts" :value="opt.value">{{opt.text}}</option>
				</select>
			</div>
			<div ref="figContainer"></div>
		</div>`,
	mounted() {
		this.plotFigure();
	},
	data() {
		return {
			arg: this.options[0].value,
			opts: this.options,
		};
	},
	methods: {
		plotFigure() {
			let fig = null;
			this.$refs.figContainer.innerHTML = "";
			if (this.$root.status != "loaded") {return;}
			else if (this.type == "data-compare") {
				fig = createDataCompare(this.$root.response, this.arg);
			} else if (this.type == "capacity-timeline") {
				if (!this.$root.response.shortterm.meta.available) {
					this.opts = this.opts.filter(x => x.value != "shortterm");
				}
				if (!this.$root.response.longterm.meta.available) {
					this.opts = this.opts.filter(x => x.value != "longterm");
				}
				fig = createCapacityTimeline(this.$root.response, this.arg);
			} else if (this.type == "dashboard") {
				fig = createJHHSDashboard(this.$root.response, this.arg);
			}
			this.$refs.figContainer.appendChild(fig);
			generateFigureDownloadButtons(fig, this.type);
		},
	},
	watch: {
		arg: "plotFigure",
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

function convertData(response, datasource="realdata") {
	let data = {
		occupancy: d3.transpose(response[datasource].occupancy),
		occupancy_notfr: d3.transpose(response[datasource].occupancy),
		beds: response.capacity_levels[0],
		capacity_levels: d3.transpose(response.capacity_levels),
		config: {
			dates: response[datasource].meta.date_range,
			node_names: response.hospitals,
			capacity_names: response.meta.capacity_names,
		},
	};
	data = unproxy(data);
	return data;
}

function createJHHSDashboard(response, datasource="realdata") {
	const data = convertData(response, datasource);
	const fig = makeJHHSDashboard(data);
	return fig;
}

function createCapacityTimeline(response, datasource="realdata") {
	const data = convertData(response, datasource);
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
		.then(response => {
			const nodeNameMap = {"BMC": "H1", "HCGH": "H2", "JHH": "H3", "SH": "H4", "SMH": "H5"};
			response.hospitals = response.hospitals.map((n) => nodeNameMap[n]);
			return response;
		})
		.then(data => {
			console.log(data);
			vm.$data.response = data;
			vm.$data.status = "loaded";
		});
}
updateData();
