#!/usr/bin/env ruby
# frozen_string_literal: true

# Writes GitHub Actions outputs: matrix JSON + analyze_count (for conditional analyze job).

require "json"
require "yaml"

root = File.expand_path("..", __dir__)
config_path = File.join(root, ".github", "modifius-config.yml")
manifest_path = File.join(root, "modifius-file-manifest.txt")

run = ENV["MODIFIUS_RUN_ANALYZE"].to_s == "true"
max = 30
if File.file?(config_path)
  c = YAML.load_file(config_path)
  max = (c["analyze_max_files"] || 30).to_i
  max = 30 if max <= 0
end

files = []
if run && File.file?(manifest_path)
  File.readlines(manifest_path, chomp: true).each do |line|
    break if files.size >= max

    next if line.empty? || line.start_with?("#")
    next if line.include?("..")

    files << line
  end
end

matrix = { "include" => files.map { |f| { "file" => f } } }
out_path = ENV["GITHUB_OUTPUT"]
unless out_path && !out_path.empty?
  warn JSON.pretty_generate(matrix)
  exit 0
end

json = JSON.generate(matrix)
File.open(out_path, "a") do |io|
  io << "matrix<<MODIFIUS_MATRIX_EOF\n"
  io << json
  io << "\nMODIFIUS_MATRIX_EOF\n"
  io << "analyze_count=#{files.size}\n"
end
