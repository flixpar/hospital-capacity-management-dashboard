# Hospital Capacity Management Dashboard

## Overview

This project is an online dashboard for capacity management of hospitals during a demand surge (such as a pandemic). It provides mathematical optimization for patient allocation and transfer decisions across hospital systems, along with data visualizations and a status report. The dashboard was originally developed for the Johns Hopkins Health System but has been generalized to support any set of hospitals.

This dashboard is deployed at [hcm-dashboard.optimal-lab.com](https://hcm-dashboard.optimal-lab.com).

## Abstract

Data-driven optimization models have the potential to significantly improve hospital capacity management, particularly during demand surges, when effective allocation of capacity is most critical and challenging. However, integrating models into existing processes in a way that provides value requires recognizing that hospital administrators are ultimately responsible for making capacity management decisions, and carefully building trustworthy and accessible tools for them. We have developed an interactive, user-friendly, electronic dashboard for informing hospital capacity management decisions during surge periods. The dashboard integrates real-time hospital data, predictive analytics, and optimization models. It allows hospital administrators to interactively customize parameters, enabling them to explore a range of scenarios, and provides real-time updates on recommended optimal decisions. The dashboard was created through a participatory design process, involving hospital administrators in the development team to ensure practical utility, trustworthiness, transparency, explainability, and usability. We successfully deployed our dashboard within the Johns Hopkins Health System during the height of the COVID-19 pandemic, addressing the increased need for tools to inform hospital capacity management. It was used on a daily basis, with results regularly communicated to hospital leadership. This work demonstrates the practical application of a prospective, data-driven, interactive decision-support tool for hospital system capacity management.

Read more about the dashboard in our [preprint](https://arxiv.org/abs/2403.15634).

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
    git clone https://github.com/flixpar/hospital-capacity-management-dashboard.git
    cd hospital-capacity-management-dashboard
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
