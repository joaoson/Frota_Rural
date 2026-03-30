# Frota Rural - BackEnd

A Django-based backend for the Frota Rural project.

## Prerequisites

Before running this project, ensure you have the following installed:

- **Python 3.14**: The project is developed and tested with Python 3.14.
- **PostgreSQL 17**: The database used is PostgreSQL version 17.
- **Virtual Environment**: Python's `venv` module for isolated environment management.

## Setup Instructions

1. **Clone the repository** (if not already done):

   ```bash
   git clone <repository-url>
   cd Frota_Rural/BackEnd
   ```

2. **Create and activate a virtual environment**:

   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**:

   ```bash
   pip install -r environment/requirements.txt
   ```

4. **Set up PostgreSQL database**:
   - Ensure PostgreSQL 17 is running on your system.
   - Create a database named `frota_rural` (or as specified in your `.env` file).
   - Create a user with appropriate permissions (e.g., `postgres`).

5. **Create environment configuration**:
   - Copy or create a `.env` file in the `environment/` folder with your database credentials:
     ```
     DB_NAME=frota_rural
     DB_USER=postgres
     DB_PASSWORD=your_password
     DB_HOST=localhost
     DB_PORT=5432
     ```
   - Adjust the values according to your PostgreSQL setup.

## Running the Project

1. **Activate the virtual environment** (if not already activated):

   ```bash
   source venv/bin/activate
   ```

2. **Run database migrations** (if needed):

   ```bash
   python manage.py migrate
   ```

3. **Start the Django development server**:

   ```bash
   python manage.py runserver
   ```

4. **Access the application**:
   - Open your browser and go to `http://127.0.0.1:8000/`

## Additional Notes

- If you encounter any database connection issues, verify your `.env` file settings and ensure PostgreSQL is running.
- For production deployment, consider using environment variables or a secrets management system instead of the `.env` file.
- Make sure to keep your virtual environment activated whenever working with the project.
