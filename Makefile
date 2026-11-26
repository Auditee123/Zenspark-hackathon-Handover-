# Handover on AgentMesh: local runner. Phase 1 targets; web app targets arrive in Phase 2 (see docs/PLAN.md).
SHELL := /bin/bash
HOSTS := handover-orchestrator handover-qa handover-kt-session

.PHONY: help setup doctor hosts-unpack hosts stop health logs inputs-bundle

help: ## List targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-14s %s\n", $$1, $$2}'

setup: ## Once per clone: enable the secret-blocking pre-commit hook
	git config core.hooksPath .githooks
	@echo "pre-commit hook enabled"

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
