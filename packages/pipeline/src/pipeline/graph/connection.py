"""Neo4j driver setup and session management."""

from contextlib import contextmanager

from neo4j import GraphDatabase

from pipeline.config import NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, NEO4J_DATABASE

_driver = None


def get_driver():
    """Get or create the Neo4j driver singleton."""
    global _driver
    if _driver is None:
        _driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    return _driver


def close_driver():
    """Close the Neo4j driver."""
    global _driver
    if _driver is not None:
        _driver.close()
        _driver = None


@contextmanager
def get_session(*, fetch_size: int = 1000):
    """Get a Neo4j session as a context manager."""
    driver = get_driver()
    session = driver.session(database=NEO4J_DATABASE, fetch_size=fetch_size)
    try:
        yield session
    finally:
        session.close()
