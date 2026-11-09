#!/bin/sh
# The container healthcheck initiates the replica set; nothing to do on first boot.
# Kept so the init folder mount is valid and to document the replica set name (rs0).
echo "mongo init: replica set rs0 is initiated by the healthcheck"
