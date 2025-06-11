# Hospital Capacity Management Dashboard

## Overview

This project is an online dashboard for capacity management of hospitals during a demand surge (such as a pandemic). It provides mathematical optimization for patient allocation and transfer decisions across hospital systems, along with data visualizations and a status report. The backend is written in Julia, and the frontend is written in JavaScript.

The dashboard was originally developed for a specific hospital system but has been generalized to support any set of hospitals.

## Features

-   **Decision Optimization**: Utilizes mathematical models to recommend optimal patient allocation and transfers.
-   **Data Visualization**: Interactive charts and dashboards to visualize hospital capacity and patient distribution.
-   **Status Reports**: Generates reports on the current state of the hospital system.
-   **REST API**: Provides endpoints for accessing data and running optimization models.

## Getting Started

### Prerequisites

-   [Julia](https://julialang.org/)
-   Access to a Gurobi solver license (the optimizer used in the backend)

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/flixpar/patient-redistribution-site-public
    cd patient-redistribution-site-public
    ```
2.  Install Julia dependencies:
    ```bash
    julia --project -e "using Pkg; Pkg.instantiate()"
    ```

### Running the Application

To start the web server:
```bash
julia --project=. src/server.jl
```
The application will be available at `http://localhost:8000`. The port can be configured with the `PORT` environment variable.

### Generating Synthetic Data

To generate new synthetic data for the dashboard:
```bash
cd generate_data/
julia generate_data.jl
julia package_generated_data.jl
```
This will create a `data.jlser` file in the `data/` directory.

## Architecture

### Backend (Julia)

-   **Web Framework**: [Genie.jl](https://genieframework.com/) for REST API and routing.
-   **Optimization**: [JuMP.jl](https://jump.dev/) with Gurobi solver for mathematical optimization.
-   **Core Modules**:
    -   `DataLoader.jl`: Hospital data loading and preprocessing.
    -   `HospitalDecisionOptimization.jl`: Advanced capacity and transfer optimization.
    -   `PatientAllocationResults.jl`: Results processing and analysis.
    -   `EndpointHandler.jl`: API request handling and business logic.

### Frontend

-   **Framework**: Mostly plain JavaScript with some [Vue.js 3](https://v3.vuejs.org/).
-   **Styling**: [Bulma CSS](https://bulma.io/).
-   **Visualization**: [D3.js](https://d3js.org/) for interactive charts.
