
# Diamond Space Carwash Management System

A digital carwash management application built with Django REST Framework, React, and PostgreSQL.

## Project Overview

The Diamond Space Carwash Management System is designed to digitize and streamline carwash operations at Diamond Space Limited.

The application will replace manual paper-based job recording and delayed Excel data entry with a centralized management platform.

## Project Objectives

- Digitize vehicle registration and job tracking.
- Manage carwash services and pricing.
- Assign cleaners to washing jobs.
- Automate cleaner commission calculations.
- Track Cash and M-Pesa payments.
- Generate financial and operational reports.

## Project Structure

```text
diamond-space/
├── backend/
├── frontend/
├── docs/
└── README.md
```

## Technology Stack

### Backend
- Python
- Django
- Django REST Framework

### Frontend
- React
- JavaScript
- CSS

### Database
- PostgreSQL

## Business Rules

- Day shift cleaner commission: 30%.
- Night shift cleaner commission: 35%.
- Commission is shared equally when multiple cleaners work on one vehicle.
- Customers can pay using Cash or M-Pesa.
- All washing jobs and payments must be digitally recorded.

## Project Status

Phase 0: Project foundation and planning.

## License

Proprietary software developed for Diamond Space Limited.
