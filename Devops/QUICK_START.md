# Start the app

**Open Docker Desktop first.** Docker runs the app on your Mac, even when its
database is hosted by Supabase.

```bash
open -a Docker
```

Wait until Docker Desktop says its engine is running. Then use the same command
on any branch that contains the new helper:

```bash
python3 Devops/dev.py up
```

The checked-out branch chooses the database:

| Branch | Database | Default app URL |
| --- | --- | --- |
| `develop`, `acceptance`, or any feature branch | Local PostgreSQL in Docker | http://localhost:5173 |
| Exactly `main` | Online Supabase project | http://localhost:5174 |

`acceptance` is a supported branch name; it has not been created yet. These
commands become available on other branches after the helper is merged there.

## Use it now on your Mac

Your current checkout is a feature branch, so these commands use local data.
The offset avoids ports already occupied on this Mac.

```bash
cd /Users/joaovitordefreitas/.codex/worktrees/develop-integration/Frota_Rural
python3 Devops/dev.py up --port-offset 2
```

Open **http://localhost:5175**. To stop it while keeping its data:

```bash
python3 Devops/dev.py down --port-offset 2
```

## Run `main` with Supabase

Once `main` contains the helper, it needs an ignored `.env.supabase` file in that
checkout with your connection settings. See [Supabase setup](SUPABASE.md).
Resume the project in the Supabase dashboard if it is paused. Missing settings
produce an error; the app will not silently switch to local data.

Your existing Supabase app already uses port 5174 and remains unchanged. In a
separate checkout on `main`, use offset 3 to open the new app on **5176**:

```bash
python3 Devops/dev.py config --port-offset 3
python3 Devops/dev.py up --port-offset 3
python3 Devops/dev.py check-db --port-offset 3
```

To stop that app: `python3 Devops/dev.py down --port-offset 3`.

## Checks and tests

For the local app on this Mac, including when your branch is `main`:

```bash
python3 Devops/dev.py config --mode local --port-offset 2
python3 Devops/dev.py up --mode local --port-offset 2
python3 Devops/dev.py check-db --mode local --port-offset 2
python3 Devops/dev.py test --mode local --port-offset 2
python3 Devops/dev.py e2e --mode local --port-offset 2
python3 Devops/dev.py down --mode local --port-offset 2
```

`config` validates settings without starting anything. `check-db` checks the
connection without changing data. Automated tests always require local mode.

**Before switching branches:** stop the app using `down` with the same options
you used to start it (offset and any explicit mode, project or env file), save
your changes, switch branches, then run `up` again.
Running containers retain their database connection while source edits appear
immediately, so switching branches while the app runs can mix code and settings.
Do not switch the current checkout while its changes are uncommitted.

Starting either mode does not copy data between databases. More options are in
the [development guide](DEVELOPMENT.md).
