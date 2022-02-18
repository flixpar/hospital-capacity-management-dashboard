module DataLoader

using Serialization
using DataFrames
using Distributions
using Dates
using LinearAlgebra: diagm

export load_jhhs
export load_completedata
export los_dist_default

ENABLE_BCC = false


function load_jhhs(
		scenario::Symbol,
		patient_type::Symbol,
		start_date::Date,
		end_date::Date,
	)

	rawdata = deserialize("data/data.jlser")

	data_range = rawdata.realdata[:meta].date_range
	shortterm_range = rawdata.shortterm[:meta].date_range
	longterm_range = rawdata.longterm[:meta].date_range

	los_dist = los_dist_default(patient_type)

	realdata = (;
		active = rawdata.realdata[patient_type].active,
		admitted = rawdata.realdata[patient_type].admitted,
		dates = data_range,
	)
	shortterm = (;
		active = rawdata.shortterm[patient_type, scenario].active,
		admitted = rawdata.shortterm[patient_type, scenario].admitted,
		dates = shortterm_range,
	)
	longterm = (;
		active = rawdata.longterm[patient_type, scenario].active,
		admitted = rawdata.longterm[patient_type, scenario].admitted,
		dates = longterm_range,
	)

	if start_date in data_range && end_date in data_range
		data = realdata
	elseif start_date in data_range && end_date in shortterm_range && scenario != :none
		data = merge_sources(shortterm, realdata)
	elseif start_date in shortterm_range && end_date in shortterm_range && scenario != :none
		data = shortterm
	elseif start_date in data_range && end_date in longterm_range && scenario != :none
		data = merge_sources(longterm, realdata)
	elseif start_date in longterm_range && end_date in longterm_range && scenario != :none
		data = longterm
	else
		error("Invalid data loading parameters: $(scenario), $(patient_type), $(start_date), $(end_date)")
	end

	day0_t = findfirst(==(start_date-Day(1)), data.dates)
	day0_t = isnothing(day0_t) ? 1 : day0_t
	initial = data.active[:,day0_t]

	data = filter_data(data, start_date, end_date)
	active = data.active
	admitted = data.admitted

	admitted = max.(0.0, admitted)

	N, T = size(admitted)
	discharged_ratio = pdf.(los_dist, 0:T-1)
	discharged_ratio[1] = isinf(discharged_ratio[1]) ? 0 : discharged_ratio[1]
	discharged = initial * discharged_ratio'

	capacity = rawdata.capacity[patient_type]

	default_capacity_level = 1
	beds = capacity[:,default_capacity_level]

	adj = BitArray(ones(N,N) - diagm(ones(N)))

	hospitals = rawdata.capacity[:meta].hospitals

	hospital_locations = Dict(
		"JHH"  => (lat = 39.2961773, long = -76.5939447),
		"SMH"  => (lat = 38.9364687, long = -77.1091435),
		"HCGH" => (lat = 39.2136187, long = -76.885917),
		"BMC"  => (lat = 39.290101,  long = -76.5468383),
		"SH"   => (lat = 38.9973285, long = -77.1105309),
	)

	region = (region_type="hospital_system", region_name="JHHS", region_fullname="Johns Hopkins Health System")
	extent = (extent_type = :points, extent_regions = [])

	outdata = (;
		active,
		initial,
		discharged,
		admitted,
		beds,
		capacity,
		adj,
		start_date,
		end_date,
		region,
		node_locations = hospital_locations,
		node_names = hospitals,
		node_names_abbrev = hospitals,
		extent,
		capacity_names = rawdata.capacity[:meta].capacity_names,
	)

	if (patient_type == :acute) && ENABLE_BCC
		outdata = add_bcc(outdata)
	end

	return outdata
end

function load_completedata(patienttype, scenario)
	data = deserialize("data/data.jlser")

	patienttype = Symbol(patienttype)
	scenario = Symbol(scenario)

	outdata = (
		realdata = (
			active = data.realdata[patienttype].active,
			admitted = data.realdata[patienttype].admitted,
			meta = data.realdata[:meta],
		),
		shortterm = (
			active = data.shortterm[(patienttype, scenario)].active,
			admitted = data.shortterm[(patienttype, scenario)].admitted,
			meta = data.shortterm[:meta],
		),
		longterm = (
			active = data.longterm[(patienttype, scenario)].active,
			admitted = data.longterm[(patienttype, scenario)].admitted,
			meta = data.longterm[:meta],
		),
		capacity = data.capacity[patienttype],
		hospitals = data.capacity[:meta].hospitals,
		meta = (;
			capacity_names = data.capacity[:meta].capacity_names,
		),
	)
	return outdata
end

function los_dist_default(bedtype::Symbol)
	if bedtype == :icu
		return Gamma(1.77595, 5.9512)
	elseif bedtype == :ward || bedtype == :acute
		return Gamma(2.601, 3.8046)
	else
		return Gamma(2.244, 4.4988)
	end
end

function add_bcc(data)
	N, T = size(data.admitted)
	C = size(data.capacity, 2)

	bcc_cap = 200

	adj = BitArray([
		data.adj      ones(Bool,N);
		ones(Bool,N)'            0;
	])

	node_locations = data.node_locations
	node_locations["BCC"] = (lat = 39.2853908, long = -76.6171126)

	outdata = merge(data, (
		initial = vcat(data.initial, 0),
		discharged = vcat(data.discharged, zeros(T)'),
		admitted = vcat(data.admitted, zeros(T)'),
		beds = vcat(data.beds, bcc_cap),
		capacity = vcat(data.capacity, fill(bcc_cap, C)'),
		adj = adj,
		node_locations = node_locations,
		node_names = vcat(data.node_names, "BCC"),
		node_names_abbrev = vcat(data.node_names_abbrev, "BCC"),
	))

	return outdata
end

function merge_sources(data1, data2)
	start_date = min(minimum(data1.dates), minimum(data2.dates))
	end_date = max(maximum(data1.dates), maximum(data2.dates))
	dates = collect(start_date : Day(1) : end_date)

	data1_dates_t = [findfirst(==(d), dates) for d in data1.dates]
	data2_dates_t = [findfirst(==(d), dates) for d in data2.dates]

	N = size(data1.active, 1)
	T = length(dates)

	active = fill(NaN, (N, T))
	admitted = fill(NaN, (N, T))

	active[:,data1_dates_t] = data1.active
	active[:,data2_dates_t] = data2.active

	admitted[:,data1_dates_t] = data1.admitted
	admitted[:,data2_dates_t] = data2.admitted

	interpolate_missing!(active)
	interpolate_missing!(admitted)

	return (;active, admitted, dates)
end

function filter_data(data, start_date, end_date)
	start_date_t = findfirst(==(start_date), data.dates)
	end_date_t = findfirst(==(end_date), data.dates)
	return (
		active = data.active[:,start_date_t:end_date_t],
		admitted = data.admitted[:,start_date_t:end_date_t],
		dates = data.dates[start_date_t:end_date_t],
	)
end

function interpolate_missing!(xs::AbstractArray{Float64,2})
	for i in 1:size(xs,1)
		interpolate_missing!(@view xs[i,:])
	end
	return xs
end

function interpolate_missing!(xs::AbstractArray{Float64,1})
	isnnan(x) = !isnan(x)

	if all(isnan.(xs))
		fill!(xs, 0.0)
		return xs
	end

	for i in 1:length(xs)
		if isnan(xs[i])
			a = findprev(isnnan, xs, i)
			b = findnext(isnnan, xs, i)

			a = isnothing(a) ? b : a
			b = isnothing(b) ? a : b

			m = (a==b) ? 0 : ((xs[b]-xs[a]) / (b-a))
			xs[i] = (m * (i-a)) + xs[a]
		end
	end

	return xs
end

end
