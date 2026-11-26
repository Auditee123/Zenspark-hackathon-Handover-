# Handover on AgentMesh: local runner (agent hosts + web app). See README.md and docs/PLAN.md.
SHELL := /bin/bash
HOSTS := handover-orchestrator handover-qa handover-kt-session

.PHONY: help setup doctor hosts-unpack hosts stop health logs inputs-bundle web mock demo check

help: ## List targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-14s %s\n", $$1, $$2}'

setup: ## Once per clone: enable the secret-blocking pre-commit hook and install the web app
	git config core.hooksPath .githooks
	@echo "pre-commit hook enabled"
	cd agentmesh/web && npm install --no-audit --no-fund

web: ## Web app against the live hosts: http://localhost:5180
	cd agentmesh/web && npx vite --port 5180 --strictPort

mock: ## Web app on labelled mock data, no hosts needed: http://localhost:5181
	cd agentmesh/web && VITE_RUNTIME=mock npx vite --port 5181 --strictPort

demo: ## Start the 3 hosts, wait for /health, then the web app (Ctrl-C stops the web app; make stop stops the hosts)
	@$(MAKE) -s hosts
	@echo "waiting for the hosts..."
	@for i in $$(seq 1 120); do n=0; for p in 8001 8002 8003; do curl -s -m 2 -o /dev/null localhost:$$p/health && n=$$((n+1)); done; [ $$n -eq 3 ] && break; sleep 3; done
	@$(MAKE) -s health
	@$(MAKE) -s web

smoke: ## Live smoke test of the 3 agents (stops before H3; test addresses only; about 3 minutes)
	python3.12 -I scripts/smoke_live.py

forget-runs: ## Stop the orchestrator and delete its LOCAL run history (e.g. after a run used real addresses)
	-@pkill -f 'handover_orchestrator.app' && echo "orchestrator stopped" || true
	rm -rf agentmesh/hosts/handover-orchestrator/.local/invocations.json agentmesh/hosts/handover-orchestrator/.local/checkpoints
	@echo "local orchestrator run history deleted; start again with: make hosts"

check: ## Typecheck and lint the web app
	cd agentmesh/web && npm run typecheck && npm run lint

doctor: ## Check tools, inputs, .env values (never printed), VPN and running hosts
	@scripts/doctor.sh

hosts-unpack: ## Recreate agentmesh/hosts/* from inputs/zips (keeps .env, .venv, .local)
	scripts/unpack-hosts.sh

hosts: ## Start the three agent hosts in the background (logs in logs/)
	@mkdir -p logs
	@for h in $(HOSTS); do \
	  echo "starting $$h (log: logs/$$h.log)"; \
	  (cd agentmesh/hosts/$$h && nohup ./startup.sh > ../../../logs/$$h.log 2>&1 &) ; \
	done
	@echo "first start installs packages (several minutes); then: make health"

stop: ## Stop the three agent hosts
	-@pkill -f 'handover_orchestrator.app|handover_qa.app|handover_kt_session.app' && echo "stopped" || echo "no hosts running"

health: ## Check /health on 8001-8003
	@for p in 8001 8002 8003; do printf "%s " $$p; curl -s -m 5 localhost:$$p/health || printf "down"; echo; done

logs: ## Follow the host logs
	tail -F logs/*.log

inputs-bundle: ## Zip inputs/ to share PRIVATELY with a teammate (Teams/OneDrive, never GitHub)
	@f=handover-inputs-$$(date +%Y%m%d).zip; zip -qrFS $$f inputs -x '*.DS_Store'; \
	echo "$$f ready ($$(du -h $$f | cut -f1)). Share it privately; send the AZURE_* values separately."
