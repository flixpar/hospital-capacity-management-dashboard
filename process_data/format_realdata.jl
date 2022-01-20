using CSV
using Dates
using StringEncodings
using DataFrames

include("util.jl")


function format_data()

	data_date = replace(string(latest_data()), "-" => "_")

	hospitals = ["BMC", "HCGH", "JHH", "SH", "SMH"]

	function load_active()

		census_total_data = DataFrame(CSV.File(open(read, "../rawdata/realdata_$(data_date)/Occupancy.csv", enc"UTF-16")))
		active_total_data = filter(row -> !ismissing(row.CalcInstitutionName) && row.CalcInstitutionName != "JOHNS HOPKINS ALL CHILDREN'S HOSPITAL", census_total_data)
		active_total_data = select(active_total_data,
			:CalcInstitutionName => (xs -> [string(split.(x, " ")[1]) for x in xs]) => :hospital,
			"Day of adate" => (x -> Date.(x, dateformat"U d, Y")) => :date,
			:CensusCount => :active_total,
		)

		census_icu_data = DataFrame(CSV.File(open(read, "../rawdata/realdata_$(data_date)/OccupancyICU.csv", enc"UTF-16")))
		active_icu_data = filter(row -> !ismissing(row.CalcInstitutionName) && row.CalcInstitutionName != "JOHNS HOPKINS ALL CHILDREN'S HOSPITAL", census_icu_data)
		active_icu_data = select(active_icu_data,
			:CalcInstitutionName => (xs -> [string(split.(x, " ")[1]) for x in xs]) => :hospital,
			"Day of adate" => (x -> Date.(x, dateformat"U d, Y")) => :date,
			:CensusICUCount => :active_icu,
		)

		census_flagged_data = DataFrame(CSV.File(open(read, "../rawdata/realdata_$(data_date)/OccupancyActive.csv", enc"UTF-16")))
		active_flagged_data = filter(row -> !ismissing(row.CalcInstitutionName) && row.CalcInstitutionName != "JOHNS HOPKINS ALL CHILDREN'S HOSPITAL", census_flagged_data)
		active_flagged_data = select(active_flagged_data,
			:CalcInstitutionName => (xs -> [string(split.(x, " ")[1]) for x in xs]) => :hospital,
			"Day of adate" => (x -> Date.(x, dateformat"U d, Y")) => :date,
			:CensusCount => :active_total_flagged,
		)

		census_icu_flagged_data = DataFrame(CSV.File(open(read, "../rawdata/realdata_$(data_date)/OccupancyICUActive.csv", enc"UTF-16")))
		census_icu_flagged_data = filter(row -> !ismissing(row.CalcInstitutionName) && row.CalcInstitutionName != "JOHNS HOPKINS ALL CHILDREN'S HOSPITAL", census_icu_data)
		census_icu_flagged_data = select(census_icu_flagged_data,
			:CalcInstitutionName => (xs -> [string(split.(x, " ")[1]) for x in xs]) => :hospital,
			"Day of adate" => (x -> Date.(x, dateformat"U d, Y")) => :date,
			:CensusICUCount => :active_icu_flagged,
		)

		active_data = outerjoin(active_total_data, active_flagged_data, active_icu_data, census_icu_flagged_data, on=[:hospital, :date])
		for col in names(active_data)
			active_data[!,col] = coalesce.(active_data[!,col], 0)
		end
		active_data.active_acute = active_data.active_total - active_data.active_icu

		return active_data
	end

	function load_admissions(hname, icu)
		fn_ext = icu ? "ICU" : ""
		colname = icu ? :admissions_icu : :admissions_all

		adm = DataFrame(CSV.File(open(read, "../rawdata/realdata_$(data_date)/$(hname)Admits$(fn_ext).csv", enc"UTF-16")))
		adm = stack(adm, r"adate*")

		z = maximum([x for x in names(adm) if contains(x, "Column")])
		adm[:,z] = [ismissing(x) ? "date" : x for x in adm[:,z]]

		adm = unstack(adm, :variable, z, :value)
		select!(adm,
			:date,
			"Admissions to JHMI (excludes transfers)" => :admissions,
		)
		adm.date = [Date(d, dateformat"m/d/yyyy") for d in adm.date]
		adm.admissions = [parse(Float64, x) for x in adm.admissions]
		adm.admissions = [Int(x) for x in adm.admissions]

		rename!(adm, :admissions => colname)

		return adm
	end

	function load_admissions()
		data = []
		for hname in hospitals
			df_a = load_admissions(hname, false)
			df_b = load_admissions(hname, true)
			df = outerjoin(df_a, df_b, on=:date)
			insertcols!(df, 1, :hospital => fill(hname, nrow(df)))
			push!(data, df)
		end
		df = vcat(data...)
		return df
	end

	active_data = load_active()
	admissions_data = load_admissions()

	combined_data = outerjoin(active_data, admissions_data, on=[:hospital, :date])
	for col in names(combined_data)
		combined_data[!,col] = coalesce.(combined_data[!,col], 0)
	end
	sort!(combined_data, [:hospital, :date])

	combined_data |> CSV.write("../data/jhhs_realdata_$(data_date).csv")

	return
end

if abspath(PROGRAM_FILE) == @__FILE__
	format_data()
end
