export const chainTitle = data => data?.title && data.title.split(' ').length < 3 ? data.title : data?.short_name
