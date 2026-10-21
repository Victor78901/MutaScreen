from backend.main import MOLECULES, VARIANTS, filter_molecules, FilterRequest, shortlist, ShortlistRequest


def test_demo_library_has_controls_and_all_five_variant_scores():
    assert len(MOLECULES) == 300
    assert len({m["smiles"] for m in MOLECULES}) == 300
    assert {"Pyrimethamine", "Cycloguanil", "WR99210", "P218"} <= {
        m["name"] for m in MOLECULES
    }
    assert all(set(m["scores"]) == {v["id"] for v in VARIANTS} for m in MOLECULES)


def test_resistance_scores_reward_broad_binding():
    pyrimethamine = next(m for m in MOLECULES if m["name"] == "Pyrimethamine")
    p218 = next(m for m in MOLECULES if m["name"] == "P218")
    assert pyrimethamine["scores"]["quad"] > pyrimethamine["scores"]["wild"]
    assert p218["scores"]["quad"] < -8
    assert p218["resistance_score"] > pyrimethamine["resistance_score"]


def test_filter_and_shortlist_return_consistent_results():
    filtered = filter_molecules(FilterRequest())
    assert filtered["total"] == 300
    assert filtered["passed"] == sum(m["drug_like"] for m in filtered["molecules"])
    results = shortlist(ShortlistRequest(count=5, minimum_score=0))["molecules"]
    assert len(results) == 5
    assert results == sorted(results, key=lambda m: (-m["resistance_score"], m["spread"]))
