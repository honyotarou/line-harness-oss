#!/usr/bin/env ruby
# frozen_string_literal: true

# Lists TypeScript sources under .github/modifius-config.yml target_paths for
# Modifius-style prep (batched analyze jobs can consume modifius-file-manifest.txt).

require "yaml"

root = File.expand_path("..", __dir__)
config_path = File.join(root, ".github", "modifius-config.yml")
unless File.file?(config_path)
  warn "missing #{config_path}"
  exit 1
end

c = YAML.load_file(config_path)
paths = Array(c["target_paths"]).map { |p| p.to_s.sub(%r{\A\./}, "") }
excludes = Array(c["exclude_patterns"]).map { |p| Regexp.new(p.to_s) }
max_files = (c["max_manifest_files"] || 200).to_i
max_files = 200 if max_files <= 0

exts = %w[.ts .tsx .mts .cts]
listed = []

paths.each do |base|
  abs = File.join(root, base)
  next unless File.directory?(abs)

  Dir.glob(File.join(abs, "**", "*"), File::FNM_DOTMATCH).each do |abs_path|
    next if File.directory?(abs_path)
    next unless exts.any? { |ext| abs_path.end_with?(ext) }

    rel = abs_path.delete_prefix("#{root}/")
    next if excludes.any? { |re| rel =~ re }

    listed << rel
  end
end

listed.sort!
truncated = listed.size > max_files
body = listed.take(max_files).join("\n")
body += "\n# ... truncated (#{listed.size - max_files} more)\n" if truncated

out = File.join(root, "modifius-file-manifest.txt")
File.write(out, "#{body}\n")
$stdout.puts "wrote #{out} (#{[listed.size, max_files].min} lines shown, total #{listed.size})"
