#!/usr/bin/env ruby
require 'json'
require 'open3'

module WorkspacePicker
  ID = 'crmne.hyprmoncfg-workspaces'
  URL = 'https://github.com/crmne/omarchy-hyprmoncfg-workspaces'

  class Omarchy
    def run(*args)
      out, err, result = Open3.capture3('omarchy', 'plugin', *args)
      raise (err.empty? ? out : err).strip[0, 2000] unless result.success?
      out
    end

    def plugins
      JSON.parse(run('list', '--json'))
    end

    def enable(id) = run('enable', id)
    def disable(id) = run('disable', id)
  end

  # Native plugin commands preserve the original widget's position and settings.
  # Restore the previous choice if enabling the replacement fails.
  def self.activate(host)
    entries = host.plugins
    target = entries.find { |plugin| plugin['id'] == ID }
    raise 'Install hyprmoncfg Workspaces first.' unless target
    previous = entries.select do |plugin|
      plugin['enabled'] && plugin['id'] != ID &&
        (plugin['id'] == 'omarchy.workspaces' || plugin['clonedFrom'] == 'omarchy.workspaces')
    end
    return if target['enabled'] && previous.empty?

    begin
      # The installer's optional enable step may already have placed the picker
      # alongside another clone. Restore the old slot first so the native enable
      # operation can inherit its placement instead of leaving two pickers.
      host.disable(ID) if target['enabled'] && !previous.empty?
      previous.each { |plugin| host.disable(plugin['id']) unless plugin['id'] == 'omarchy.workspaces' }
      host.enable(ID)
    rescue StandardError => error
      recovery_errors = []
      begin
        host.disable(ID)
      rescue StandardError => recovery
        recovery_errors << recovery.message
      end
      previous.each do |plugin|
        begin
          host.enable(plugin['id'])
        rescue StandardError => recovery
          recovery_errors << recovery.message
        end
      end
      suffix = recovery_errors.empty? ? '' : " Restoring the previous bar also failed: #{recovery_errors.join('; ')}"
      raise "#{error.message}#{suffix}"
    end
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    host = WorkspacePicker::Omarchy.new
    case ARGV.fetch(0, '')
    when 'install'
      # Keep Omarchy's own trust, enablement and placement questions.
      unless system('omarchy', 'plugin', 'add', WorkspacePicker::URL)
        exit($?.exitstatus || 1)
      end
      WorkspacePicker.activate(host) if host.plugins.any? { |p| p['id'] == WorkspacePicker::ID && p['enabled'] }
    when 'use'
      WorkspacePicker.activate(host)
    else
      abort 'Usage: workspace-picker.rb install|use'
    end
  rescue StandardError => error
    warn error.message
    system('notify-send', '-u', 'normal', 'Workspace bar could not be changed', error.message)
    exit 1
  end
end
