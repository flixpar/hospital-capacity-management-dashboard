module DataLoader

using CSV
using JSON
using Serialization
using DataFrames
using Distributions
using Dates
using LinearAlgebra

export load_jhhs
export los_dist_default

basepath = joinpath(dirname(@__FILE__), "../")

ENABLE_BCC = false


function load_jhhs(
		scenario::Symbol,
		patient_type::Symbol,
		start_date::Date,
		end_date::Date,
	)
	@assert(start_date < end_date)
	@assert(patient_type in [:icu, :ward, :all])

	shortterm = (scenario == :shortterm)

	data = shortterm ? deserialize("data/data_jhhs_shortterm.jlser") : deserialize("data/data_jhhs.jlser")

	if shortterm
		start_date = data.start_date
		end_date = data.end_date
	end

	@assert data.start_date <= start_date < end_date <= data.end_date

	N = length(data.location_names)
	T = (end_date - start_date).value + 1

	hospitals = data.location_names
	hospitals_abbrev = data.location_names_short

	bedtype = (patient_type == :all) ? :allbeds : patient_type
	casesdata = data.casesdata[scenario,bedtype]

	start_date_idx = (start_date - data.start_date).value + 1
	end_date_idx   = (end_date   - data.start_date).value + 1
	admitted = casesdata.admitted[:,start_date_idx:end_date_idx]

	day0 = max(data.start_date, start_date - Day(1))
	day0_idx = (day0 - data.start_date).value + 1
	initial = casesdata.active[:, day0_idx]

	if shortterm
		initial = casesdata.initial
	end

	discharged = Array{Float64,2}(undef, N, T)
	for i in 1:N
		discharged[i,:] = initial[i] .* (pdf.(casesdata.los_dist, 0:T-1))
		if isinf(discharged[i,1])
			discharged[i,1] = 0.0
		end
	end

	default_capacity_level = 1
	beds = casesdata.capacity[:,default_capacity_level]
	capacity = casesdata.capacity

	adj = (data.dist_matrix .<= 1)
	node_locations = Dict(h => data.locations_latlong[h] for h in hospitals)

	extent = (extent_type = :points, extent_regions = [])

	outdata = (
		initial = initial,
		discharged = discharged,
		admitted = admitted,
		beds = beds,
		capacity = capacity,
		adj = adj,
		start_date = start_date,
		end_date = end_date,
		node_locations = node_locations,
		node_names = hospitals,
		node_names_abbrev = hospitals_abbrev,
		extent = extent,
		capacity_names = data.capacity_names,
	)

	if (patient_type == :ward) && ENABLE_BCC
		outdata = add_bcc(outdata)
	end

	return outdata
end

function los_dist_default(bedtype::Symbol)
	if bedtype == :icu
		return Gamma(1.77595, 5.9512)
	elseif bedtype == :ward
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

end
