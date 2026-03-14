function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

function convertNodes(nodes, parentId = null) {
  if (!nodes || !Array.isArray(nodes)) return [];
  return nodes.map(node => {
    return {
      id: node.node_id || generateId(),
      title: node.title || 'Untitled Section',
      summary: node.summary || '',
      content: node.text || '',
      pageNumber: typeof node.start_index === 'number' ? node.start_index + 1 : undefined,
      parentId: parentId,
      children: convertNodes(node.nodes, node.node_id)
    };
  });
}

function flattenPageIndexNodes(nodes) {
  if (!nodes) return [];
  const result = [];
  function recurse(list) {
    for (const node of list) {
      result.push(node);
      if (node.children) recurse(node.children);
    }
  }
  recurse(nodes);
  return result;
}

const sampleTree = {
  nodes: [
    {
      node_id: "0000",
      title: "Section 1",
      summary: "sum",
      text: "content",
      nodes: []
    }
  ]
};

console.log('Test start');
const pageIndex = convertNodes(sampleTree.nodes);
console.log('Converted');
const flattened = flattenPageIndexNodes(pageIndex);
console.log('Flattened, count:', flattened.length);
console.log('Test end');
