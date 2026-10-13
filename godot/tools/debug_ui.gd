extends Node
# Autoload-free helper: prints the size of every Control under the menu after a moment.
func _ready():
	await get_tree().create_timer(1.5).timeout
	_walk(get_tree().root, 0)
	get_tree().quit()
func _walk(n, d):
	if n is Control and d < 9:
		print("  ".repeat(d), n.name, " ", n.get_class(), " pos=", n.position, " size=", n.size)
	for c in n.get_children():
		_walk(c, d + 1)
