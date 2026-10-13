class_name Rng
extends RefCounted
# A small seeded random generator (mulberry32), so every phone in an online race builds
# exactly the same road from the same seed.

var a: int


func _init(seed_value: int) -> void:
	a = seed_value & 0xFFFFFFFF


func _imul(x: int, y: int) -> int:
	return (x * y) & 0xFFFFFFFF


func next() -> float:
	a = (a + 0x6D2B79F5) & 0xFFFFFFFF
	var t := a
	t = _imul(t ^ (t >> 15), t | 1)
	t ^= (t + _imul(t ^ (t >> 7), t | 61)) & 0xFFFFFFFF
	return float((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0


func range_f(lo: float, hi: float) -> float:
	return lo + next() * (hi - lo)


func pick(list: Array):
	return list[int(next() * list.size()) % list.size()]
