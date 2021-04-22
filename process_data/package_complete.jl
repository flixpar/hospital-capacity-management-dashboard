using Serialization
using Distributions

using Convex
using Gurobi


function package_data_complete()
	data = deserialize("../data/rawdata.jlser")

	missingpatienttypes = [:icu, :acute]
	longterm_scenarios = unique([k[2] for k in keys(data.longterm) if k isa Tuple])

	los_dist = Dict(
		:icu => Gamma(1.77595, 5.9512),
		:acute => Gamma(2.601, 3.8046),
		:total => Gamma(2.244, 4.4988),
	)

	for pt in missingpatienttypes

		data.realdata[pt] = merge(
			data.realdata[pt],
			(;admitted = estimate_admitted(data.realdata[pt].active, los_dist[pt])),
		)

		m = (pt == :icu) ? 0.3 : 0.7

		data.shortterm[pt] = merge(
			data.shortterm[pt],
			(;admitted = m * data.shortterm[:total].admitted),
		)

		for sc in longterm_scenarios
			data.longterm[pt, sc] = merge(
				data.longterm[pt, sc],
				(;admitted = m * data.longterm[:total, sc].admitted),
			)
		end

	end

	serialize("../data/completedata.jlser", data)

	return
end

function estimate_admitted(active::Array{<:Real,1}, los_dist::Distribution; l::Int=35)
	T = length(active)
	L = 1.0 .- cdf.(los_dist, 0:l)

	admitted = Variable(T+l)
	est_active = [L' * admitted[(t+l):-1:t] for t in 1:T]
	cons = [admitted[t] >= 0 for t in 1:(T+l)]
	problem = minimize(sum(square.(est_active - active)), cons)

	solve!(problem, Gurobi.Optimizer, silent_solver=true)
	sol_admitted = evaluate(admitted)

	return sol_admitted[(l+1):end]
end

function estimate_admitted(active::Array{<:Real,2}, los_dist::Distribution)
	admitted = Array{Float64,2}(undef, size(active)...)
	for i in 1:size(active,1)
		admitted[i,:] = estimate_admitted(active[i,:], los_dist)
	end
	return admitted
end
