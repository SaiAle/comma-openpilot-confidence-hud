#!/usr/bin/env python3
"""
Root entry point for comma.ai Telemetry Simulator
Delegates to modular simulator at src/sim/telemetry_sim.py
"""
import os
import sys
import runpy

if __name__ == '__main__':
    sim_path = os.path.join(os.path.dirname(__file__), 'src', 'sim', 'telemetry_sim.py')
    runpy.run_path(sim_path, run_name='__main__')
