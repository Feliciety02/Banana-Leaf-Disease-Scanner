#!/usr/bin/env bash
cd "/mnt/d/Fe Anne's Repository/Banana Leaf Disease Scanner"
export CUDA_VISIBLE_DEVICES=-1
export TF_GPU_ALLOCATOR=BFC
if ! pgrep -f "uvicorn ai.deployment.comparison_service" > /dev/null 2>&1; then
  nohup /home/feanne/.venvs/dahonmd-tf-gpu/bin/python -m uvicorn ai.deployment.comparison_service:app --host 127.0.0.1 --port 8100 >> /home/feanne/dahonmd-compare.log 2>&1 &
fi
sleep 1
if pgrep -f "uvicorn ai.deployment.comparison_service" > /dev/null 2>&1; then
  echo "comparison service: RUNNING"
else
  echo "comparison service: NOT RUNNING"
fi