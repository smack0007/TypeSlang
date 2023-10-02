#!/bin/sh
SCRIPT_PATH=$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
set -e

npx tsx ${SCRIPT_PATH}/src/main.ts $1 $2.cpp
clang++ -std=c++20 -I ${SCRIPT_PATH}/ext/fmt/include -I ${SCRIPT_PATH}/src/backends/cpp -o $2 $2.cpp