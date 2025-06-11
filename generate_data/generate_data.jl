using Dates
using CSV, DataFrames
using Distributions, Statistics, Random
using Plots
using Printf


# Define structs for better type safety and code clarity
struct HospitalProfile
	hospital_id::String
	hospital_name::String
	type::String
	total_bed_capacity::Int
	covid_bed_capacity::Int
	baseline_admission_rate::Float64
	response_factor::Float64
	peak_delay::Int
	efficiency_factor::Float64
end

struct COVIDHospitalDataGenerator
	start_date::Date
	end_date::Date
	date_range::Vector{Date}
	n_days::Int

	function COVIDHospitalDataGenerator(start_date_str="2020-01-01", end_date_str="2023-12-31")
		start_d = Date(start_date_str)
		end_d = Date(end_date_str)
		date_rng = collect(start_d:Day(1):end_d)
		new(start_d, end_d, date_rng, length(date_rng))
	end
end

# Define constants for COVID waves and hospital types
const COVID_WAVES = [
	(name="Initial Wave",   peak_day=75,   intensity=0.8,  duration=45),  # Mid-March 2020
	(name="Summer 2020",    peak_day=195,  intensity=0.6,  duration=35),  # Mid-July 2020
	(name="Fall 2020",      peak_day=320,  intensity=0.9,  duration=50),  # Mid-November 2020
	(name="Winter 2020-21", peak_day=395,  intensity=1.2,  duration=55),  # Early January 2021
	(name="Delta Wave",     peak_day=605,  intensity=0.85, duration=40),  # Late August 2021
	(name="Omicron Wave",   peak_day=730,  intensity=1.0,  duration=35),  # Early January 2022
	(name="Spring 2022",    peak_day=820,  intensity=0.4,  duration=30),  # Late March 2022
	(name="Summer 2022",    peak_day=915,  intensity=0.5,  duration=35),  # Late June 2022
	(name="Winter 2022-23", peak_day=1095, intensity=0.6,  duration=40)   # Late December 2022
]

const HOSPITAL_TYPES = [
	(type="Large Academic",  bed_capacity_range=(800, 1200), covid_share=0.25),
	(type="Regional Medical",bed_capacity_range=(400, 700),  covid_share=0.20),
	(type="Community",       bed_capacity_range=(150, 350),  covid_share=0.15),
	(type="Specialty",       bed_capacity_range=(100, 250),  covid_share=0.10),
	(type="Critical Access", bed_capacity_range=(25, 100),   covid_share=0.12)
]

"""
Create diverse hospital profiles with different characteristics.
"""
function create_hospital_profiles(n_hospitals::Int=5)
	hospitals = HospitalProfile[]

	for i in 1:n_hospitals
		hospital_type = HOSPITAL_TYPES[(i-1) % length(HOSPITAL_TYPES) + 1]

		bed_capacity = rand(hospital_type.bed_capacity_range[1]:hospital_type.bed_capacity_range[2])
		covid_capacity = Int(round(bed_capacity * hospital_type.covid_share))

		hospital = HospitalProfile(
			@sprintf("H%03d", i),
			"$(hospital_type.type) Hospital $i",
			hospital_type.type,
			bed_capacity,
			covid_capacity,
			covid_capacity * 0.1,            # 10% of capacity as baseline
			rand(Uniform(0.8, 1.3)),         # How strongly hospital responds to waves
			rand(-7:14),                     # Days offset from regional peak
			rand(Uniform(0.9, 1.1))          # Operational efficiency
		)
		push!(hospitals, hospital)
	end

	return hospitals
end

"""
Generate wave pattern using a skewed normal distribution.
Corresponds to scipy.stats.skewnorm.
"""
function generate_wave_pattern(day::Int, wave_params, hospital_delay::Int=0)
	peak_day = wave_params.peak_day + hospital_delay
	intensity = wave_params.intensity
	duration = wave_params.duration

	# Use SkewNormal for realistic wave shape (loc, scale, alpha)
	dist = SkewNormal(peak_day, duration / 3, 2.0)

	# Normalize to peak value
	peak_val = pdf(dist, peak_day)
	wave_value = (peak_val > 0) ? pdf(dist, day) / peak_val : 0.0

	return intensity * wave_value
end

"""
Add seasonal variation (higher in winter months).
"""
function calculate_seasonal_factor(day_of_year::Int)
	return 1 + 0.3 * cos(2 * π * (day_of_year - 15) / 365)
end

"""
Generate daily admission data for a hospital.
"""
function generate_admissions(generator::COVIDHospitalDataGenerator, hospital::HospitalProfile)
	admissions = Int[]

	for (i, date) in enumerate(generator.date_range)
		day_of_year = dayofyear(date)

		# Start with baseline admission rate
		daily_admissions = hospital.baseline_admission_rate

		# Add seasonal variation
		seasonal_factor = calculate_seasonal_factor(day_of_year)
		daily_admissions *= seasonal_factor

		# Add COVID wave effects
		wave_effect = sum(generate_wave_pattern(i, wave, hospital.peak_delay) for wave in COVID_WAVES)

		# Apply hospital-specific response factor
		daily_admissions += wave_effect * hospital.baseline_admission_rate * hospital.response_factor

		# Add random noise
		daily_admissions *= rand(Uniform(0.7, 1.3))

		# Ensure non-negative and within realistic bounds, then round
		final_admissions = round(Int, clamp(daily_admissions, 0, hospital.covid_bed_capacity * 0.5))
		push!(admissions, final_admissions)
	end

	return admissions
end

"""
Calculate occupancy based on admissions and length of stay (LOS).
"""
function calculate_occupancy(admissions::Vector{Int}, avg_length_of_stay::Int=8)
	n_days = length(admissions)
	occupancy = zeros(Int, n_days)
	current_occupancy = 0

	# Length of stay follows a gamma distribution
	los_shape = 2.0
	los_scale = avg_length_of_stay / los_shape
	los_dist = Gamma(los_shape, los_scale)

	patient_discharges = Dict{Int, Int}() # Maps day_index -> number of discharges

	for day in 1:n_days
		# Discharge patients
		if haskey(patient_discharges, day)
			current_occupancy = max(0, current_occupancy - patient_discharges[day])
		end

		# Add new admissions
		daily_admissions = admissions[day]
		current_occupancy += daily_admissions

		# Schedule future discharges for new admissions
		for _ in 1:daily_admissions
			los = max(1, round(Int, rand(los_dist)))
			discharge_day = day + los
			if discharge_day <= n_days
				patient_discharges[discharge_day] = get(patient_discharges, discharge_day, 0) + 1
			end
		end

		occupancy[day] = current_occupancy
	end

	return occupancy
end

"""
Generate complete data for a single hospital and return a DataFrame.
"""
function generate_hospital_data(generator::COVIDHospitalDataGenerator, hospital::HospitalProfile)
	admissions = generate_admissions(generator, hospital)
	occupancy = calculate_occupancy(admissions)
	occupancy_rate = occupancy ./ hospital.covid_bed_capacity

	return DataFrame(
		date = generator.date_range,
		hospital_id = hospital.hospital_id,
		hospital_name = hospital.hospital_name,
		hospital_type = hospital.type,
		daily_admissions = admissions,
		daily_occupancy = occupancy,
		occupancy_rate = occupancy_rate,
		bed_capacity = hospital.covid_bed_capacity
	)
end

"""
Generate data for the entire hospital system.
"""
function generate_system_data(generator::COVIDHospitalDataGenerator, n_hospitals::Int=5)
	hospitals = create_hospital_profiles(n_hospitals)
	all_data = DataFrame[]

	println("Generating data for $n_hospitals hospitals...")
	for hospital in hospitals
		println("Processing $(hospital.hospital_name)...")
		hospital_data = generate_hospital_data(generator, hospital)
		push!(all_data, hospital_data)
	end

	# Combine all hospital dataframes
	combined_data = vcat(all_data...)

	return combined_data, hospitals
end

"""
Generate summary statistics using DataFrames.jl.
"""
function create_summary_statistics(data::DataFrame)
	gdf = groupby(data, [:hospital_id, :hospital_name, :hospital_type])

	summary = combine(gdf,
		:daily_admissions => sum => :total_admissions,
		:daily_admissions => mean => :avg_daily_admissions,
		:daily_admissions => maximum => :max_daily_admissions,
		:daily_occupancy => mean => :avg_occupancy,
		:daily_occupancy => maximum => :max_occupancy,
		:occupancy_rate => mean => :avg_occupancy_rate,
		:occupancy_rate => maximum => :max_occupancy_rate,
		:bed_capacity => first => :bed_capacity
	)

	# Round numeric columns for cleaner output
	for col in names(summary)
		if eltype(summary[!, col]) <: AbstractFloat
			summary[!, col] = round.(summary[!, col], digits=2)
		end
	end

	return summary
end

"""
Create visualization of the hospital system data using Plots.jl.
"""
function plot_system_overview(data::DataFrame)
	# 1. Daily admissions by hospital
	admissions_wide = unstack(data, :date, :hospital_name, :daily_admissions)
	p1 = plot(admissions_wide.date, Matrix(admissions_wide[!, Not(:date)]),
		title="Daily COVID Admissions by Hospital",
		ylabel="Daily Admissions",
		legend=:outertopright,
		label=permutedims(names(admissions_wide)[2:end])
	)

	# 2. Total system occupancy
	system_occupancy = combine(groupby(data, :date), :daily_occupancy => sum => :total_occupancy)
	p2 = plot(system_occupancy.date, system_occupancy.total_occupancy,
		title="Total System COVID Occupancy",
		ylabel="Total Occupied Beds",
		color=:red,
		linewidth=2,
		legend=false
	)

	# 3. Occupancy rates by hospital
	rates_wide = unstack(data, :date, :hospital_name, :occupancy_rate)
	p3 = plot(rates_wide.date, Matrix(rates_wide[!, Not(:date)]),
		title="COVID Bed Occupancy Rates by Hospital",
		ylabel="Occupancy Rate",
		legend=false # Too cluttered, matches Python version
	)
	hline!(p3, [1.0], color=:red, linestyle=:dash, alpha=0.7, label="100% Capacity")

	# 4. System-wide daily admissions
	system_admissions = combine(groupby(data, :date), :daily_admissions => sum => :total_admissions)
	p4 = plot(system_admissions.date, system_admissions.total_admissions,
		title="Total System Daily COVID Admissions",
		ylabel="Daily Admissions",
		color=:green,
		linewidth=2,
		legend=false
	)

	# Combine plots into a 2x2 grid
	final_plot = plot(p1, p2, p3, p4, layout=(2, 2), size=(1500, 1000), dpi=100)

	display(final_plot)
	savefig(final_plot, "outputs/system_overview.png")
	println("\nPlot saved to outputs/system_overview.png")
end


"""
Main execution function.
"""
function main()
	# Create the output directory
	mkpath("outputs/")

	# Initialize the generator
	generator = COVIDHospitalDataGenerator()

	# Generate data for 8 hospitals
	data, hospital_profiles = generate_system_data(generator, 8)

	# Display hospital profiles
	println("\nHospital Profiles:")
	println("="^80)
	for hospital in hospital_profiles
		println("$(hospital.hospital_name) ($(hospital.type))")
		println("  Total Capacity: $(hospital.total_bed_capacity) beds")
		println("  COVID Capacity: $(hospital.covid_bed_capacity) beds")
		println("  Peak Delay: $(hospital.peak_delay) days\n")
	end

	# Generate summary statistics
	summary = create_summary_statistics(data)
	println("Summary Statistics:")
	println("="^80)
	show(stdout, summary; allrows=true, allcols=true)
	println()

	# Save data to CSV
	CSV.write("outputs/covid_hospital_data.csv", data)
	CSV.write("outputs/hospital_summary_stats.csv", summary)

	# Create visualizations
	plot_system_overview(data)

	println("\nData generated successfully!")
	println("Total records: $(length(data.date))")
	println("Date range: $(minimum(data.date)) to $(maximum(data.date))")
	println("Files saved: covid_hospital_data.csv, hospital_summary_stats.csv")

	return data, summary
end


if abspath(PROGRAM_FILE) == @__FILE__
	main()
end