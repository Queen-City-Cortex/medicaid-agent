"""Real pinned local tokenization, including Unicode and density limits."""
from pipeline.embeddings.tokenizer import count_tokens,count_token_batch,asset_path
from pipeline.embeddings.planner import plan_inputs


def test_batch_matches_individual_counts_and_density_split_preserves_body():
    assert asset_path("voyage-4").exists(), "Run the pipeline setup to provision tokenizer assets"
    texts=["Heading\npolicy", "α 😀 eligibility" * 100, "😀" * 9000]
    assert count_token_batch(texts,"voyage-4") == [count_tokens(text,"voyage-4") for text in texts]
    body="😀" * 15000
    inputs=list(plan_inputs("Heading",body,"voyage-4"))
    cursor=0
    rebuilt=""
    for item in inputs:
        assert item.tokens==count_tokens(item.text,"voyage-4") <= 32000
        rebuilt += body[cursor:item.body_end]
        cursor=item.body_end
    assert rebuilt==body
