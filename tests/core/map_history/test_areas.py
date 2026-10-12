from quodeq.core.map_history.areas import AreaAssignment, assign_areas


def test_android_layer_prefixed_modules_share_an_area():
    got = assign_areas([
        "feature-article/src/main/kotlin/nl/x/edition/article/ArticleScreen.kt",
        "domain-data-article/src/main/kotlin/nl/x/edition/article/ArticleRepo.kt",
        "feature-component-tracking/src/main/kotlin/nl/x/Tracker.kt",
    ])
    assert got["feature-article/src/main/kotlin/nl/x/edition/article/ArticleScreen.kt"].area == "article"
    assert got["domain-data-article/src/main/kotlin/nl/x/edition/article/ArticleRepo.kt"].area == "article"
    assert got["feature-component-tracking/src/main/kotlin/nl/x/Tracker.kt"].area == "tracking"


def test_features_folder_and_name_stem():
    got = assign_areas([
        "Edition/Features/Article/ArticleView.swift",
        "Edition/Features/Login/LoginView.swift",
        "Edition/API/Services/ArticleService.swift",
        "Edition/ViewComponents/Button.swift",
    ])
    assert got["Edition/Features/Article/ArticleView.swift"].area == "Article"
    assert got["Edition/API/Services/ArticleService.swift"] == AreaAssignment("Article", "stem", False)
    assert got["Edition/ViewComponents/Button.swift"].layer == "shared"


def test_jvm_package_after_reverse_domain_joins_feature_area():
    got = assign_areas([
        "feature-article/src/main/kotlin/nl/x/edition/article/A.kt",
        "app/src/main/kotlin/nl/x/edition/article/B.kt",
    ])
    assert got["app/src/main/kotlin/nl/x/edition/article/B.kt"].area == "article"


def test_tests_are_flagged_and_join_their_area():
    got = assign_areas(["EditionTests/Features/Article/ArticleTests.swift", "Edition/Features/Article/A.swift"])
    a = got["EditionTests/Features/Article/ArticleTests.swift"]
    assert a.area == "Article" and a.is_test


def test_singular_and_plural_spellings_merge():
    got = assign_areas([
        "domain-data-teaser/src/a/T1.kt", "domain-data-teaser/src/a/T2.kt",
        "domain-data-teasers/src/a/T3.kt",
    ])
    assert {got[p].area for p in got} == {"teaser"}


def test_flat_repo_falls_back_to_folders_and_root():
    got = assign_areas(["main.py", "pkg/util.py"])
    assert got["main.py"].area == "(root)"
    assert got["pkg/util.py"].area == "pkg"


def test_a_stem_takes_the_longest_area_name_it_starts_with():
    got = assign_areas([
        "app/features/article/A.kt",
        "app/features/articlelist/B.kt",
        "shared/util/ArticleListAdapter.kt",
        "shared/util/ArticleCache.kt",
    ])
    assert got["shared/util/ArticleListAdapter.kt"].area == "articlelist"
    assert got["shared/util/ArticleCache.kt"].area == "article"
