require 'minitest/autorun'
require_relative '../scripts/workspace-picker'

class WorkspacePickerTest < Minitest::Test
  class Host
    attr_reader :calls, :entries
    def initialize(entries, fail_enable: false)
      @entries, @fail_enable, @calls = entries, fail_enable, []
    end
    def plugins = @entries
    def enable(id)
      @calls << [:enable, id]
      raise 'enable failed' if @fail_enable && id == WorkspacePicker::ID
    end
    def disable(id) = @calls << [:disable, id]
  end
  def target(enabled = false) = {'id'=>WorkspacePicker::ID, 'enabled'=>enabled}
  def classic = {'id'=>'crmne.global-workspaces', 'enabled'=>true, 'clonedFrom'=>'omarchy.workspaces'}

  def test_replaces_the_previous_workspace_widget_only
    host = Host.new([target, classic, {'id'=>'clock', 'enabled'=>true}])
    WorkspacePicker.activate(host)
    assert_equal [[:disable, 'crmne.global-workspaces'], [:enable, WorkspacePicker::ID]], host.calls
  end
  def test_failed_enable_restores_previous_widget
    host = Host.new([target, classic], fail_enable:true)
    assert_raises(RuntimeError) { WorkspacePicker.activate(host) }
    assert_equal [:enable, 'crmne.global-workspaces'], host.calls.last
    assert_includes host.calls, [:disable, WorkspacePicker::ID]
  end
  def test_installer_enabled_picker_reuses_the_previous_clones_slot
    host = Host.new([target(true), classic])
    WorkspacePicker.activate(host)
    assert_equal [[:disable, WorkspacePicker::ID], [:disable, 'crmne.global-workspaces'],
      [:enable, WorkspacePicker::ID]], host.calls
  end
  def test_stock_widget_is_replaced_by_native_enable
    host = Host.new([target, {'id'=>'omarchy.workspaces', 'enabled'=>true}])
    WorkspacePicker.activate(host)
    assert_equal [[:enable, WorkspacePicker::ID]], host.calls
  end
  def test_active_picker_is_not_moved
    host = Host.new([target(true)])
    WorkspacePicker.activate(host)
    assert_empty host.calls
  end
  def test_missing_picker_changes_nothing
    host = Host.new([classic])
    assert_raises(RuntimeError) { WorkspacePicker.activate(host) }
    assert_empty host.calls
  end
end
