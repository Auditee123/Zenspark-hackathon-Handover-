# Handover on AgentMesh: local runner. Phase 1 targets; the web app targets arrive in Phase 2.
SHELL := /bin/bash
HOSTS := handover-orchestrator handover-qa handover-kt-session

.PHONY: setup hosts-unpack hosts health

setup: ## Enable the secret-blocking pre-commit hook
	git config core.hooksPath .githooks
	@echo "pre-commit hook enabled"

hosts-unpack: ## Recreate agentmesh/hosts/* from inputs/zips (keeps .env, .venv, .local)
	scripts/unpack-hosts.sh

hosts: ## Start the three agent hosts (needs the VPN and the AZURE_* values in each .env)
	@mkdir -p logs
	@for h in $(HOSTS); do \
	  echo "starting $$h (log: logs/$$h.log)"; \
	  (cd agentmesh/hosts/$$h && nohup ./startup.sh > ../../../logs/$$h.log 2>&1 &) ; \
	done

health: ## Check /health on 8001-8003
	@for p in 8001 8002 8003; do printf "%s " $$p; curl -s -m 5 localhost:$$p/health || echo "down"; echo; done
