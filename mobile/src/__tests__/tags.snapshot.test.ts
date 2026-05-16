import * as tags from '../constants/tags';

describe('tags constants', () => {
  it('matches snapshot (backend sync)', () => {
    expect({
      MAX_USER_TAGS: tags.MAX_USER_TAGS,
      MAX_USER_TAG_LENGTH: tags.MAX_USER_TAG_LENGTH,
    }).toMatchSnapshot();
  });
});
